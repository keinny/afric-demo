-- =====================================================================
--  Africo Cash Advance – Loan Management System
--  Supabase / PostgreSQL schema
--
--  Run this whole file once in Supabase → SQL Editor → New query → Run.
--  It is safe to run again (uses IF NOT EXISTS / CREATE OR REPLACE).
--  Then run supabase/seed.sql to load the sample data.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Staff (people who can sign in). A staff row is matched to a Supabase
--  Auth user by email; role_key decides what they may change.
-- ---------------------------------------------------------------------
create table if not exists public.staff (
  id           text primary key,                       -- e.g. AFR-LO-03
  name         text not null,
  email        text not null unique,
  phone        text,
  department   text not null,
  designation  text,
  role_key     text not null check (role_key in ('admin','officer','verifier','manager','finance','support','analyst')),
  joined       date not null default current_date,
  active       boolean not null default true
);

-- ---------------------------------------------------------------------
--  Borrowers and the lending pipeline
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id        text primary key,                          -- CUS-001
  name      text not null,
  phone     text,
  nrc       text,
  town      text,
  employer  text,
  type      text check (type in ('Salaried','Business')),
  joined    date not null default current_date
);

create table if not exists public.applications (
  id           text primary key,                       -- AFR-APP-001
  customer_id  text not null references public.customers(id),
  product_id   text not null,                          -- SAL / SME / AST (see src/config.js)
  amount       numeric(14,2) not null check (amount > 0),
  months       integer not null check (months > 0),
  income       numeric(14,2),
  purpose      text,
  assigned_to  text,
  status       text not null check (status in ('Submitted','In Review','Approved','Disbursed','Rejected')),
  created_at   date not null default current_date,
  checklist    jsonb not null default '[]'::jsonb,     -- 6 booleans, KYC checklist
  notes        jsonb not null default '[]'::jsonb      -- [{by, role, at, text}]
);

create table if not exists public.loans (
  id               text primary key,                   -- AFR-LN-001
  app_id           text not null references public.applications(id),
  customer_id      text not null references public.customers(id),
  product_id       text not null,
  principal        numeric(14,2) not null check (principal > 0),
  rate_pct         numeric(6,3) not null,              -- monthly interest %
  method           text not null check (method in ('flat','reducing')),
  months           integer not null,
  disbursed_on     date not null,
  disburse_method  text,
  schedule         jsonb not null                      -- [{no, due, principal, interest, total}]
);

create table if not exists public.payments (
  id           text primary key,                       -- RCP-0001
  loan_id      text not null references public.loans(id),
  amount       numeric(14,2) not null check (amount > 0),
  method       text not null,                          -- Mobile Money / Bank Transfer / Cash
  date         date not null,
  ref          text,
  note         text,
  at           timestamptz not null default now(),
  recorded_by  text,
  verified     boolean not null default false          -- matched to bank / MoMo statement
);

create table if not exists public.penalties (
  id           text primary key,                       -- PEN-001
  loan_id      text not null references public.loans(id),
  amount       numeric(14,2) not null check (amount > 0),
  method       text,
  date         date not null,
  ref          text,
  at           timestamptz not null default now(),
  recorded_by  text
);

create table if not exists public.collections (
  id            text primary key,                      -- COL-001
  loan_id       text not null references public.loans(id),
  action        text not null,
  note          text,
  promise_date  date,
  at            timestamptz not null default now(),
  recorded_by   text
);

create table if not exists public.tickets (
  id           text primary key,                       -- AFR-TCK-001
  customer_id  text not null references public.customers(id),
  subject      text not null,
  category     text,
  status       text not null check (status in ('Open','In Progress','Resolved')),
  priority     text not null check (priority in ('High','Medium','Low')),
  description  text,
  assigned_to  text,
  created_at   date not null default current_date,
  replies      jsonb not null default '[]'::jsonb      -- [{by, at, text}]
);

-- Deposits seen on bank / mobile-money statements not yet matched to a loan
create table if not exists public.statement_lines (
  id         text primary key,
  channel    text not null,
  ref        text,
  amount     numeric(14,2) not null,
  date       date not null,
  narration  text
);

-- ---------------------------------------------------------------------
--  Configuration
-- ---------------------------------------------------------------------
create table if not exists public.notification_rules (
  id       text primary key,
  enabled  boolean not null default true,
  -- MESSAGING POLICY: WhatsApp can never be switched on, even directly in the database.
  constraint whatsapp_locked check (not (id = 'whatsapp' and enabled))
);

create table if not exists public.settings (
  id              integer primary key default 1 check (id = 1),   -- single row
  client_name     text,
  representative  text,
  developer       text,
  currency_code   text default 'ZMW',
  symbol          text default 'K',
  country         text default 'Zambia',
  timezone        text default 'Africa/Lusaka',
  grace_days      integer not null default 3 check (grace_days between 0 and 60),
  penalty_pct     numeric(5,2) not null default 5 check (penalty_pct between 0 and 50)
);

-- ---------------------------------------------------------------------
--  Audit trail – append-only
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id           text primary key,
  at           timestamptz not null default now(),
  actor        text not null,
  role         text,
  description  text not null
);

create or replace function public.audit_log_is_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only: entries cannot be changed or deleted';
end $$;

drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

-- ---------------------------------------------------------------------
--  Helpful indexes
-- ---------------------------------------------------------------------
create index if not exists applications_customer_idx on public.applications(customer_id);
create index if not exists loans_customer_idx        on public.loans(customer_id);
create index if not exists payments_loan_idx         on public.payments(loan_id);
create index if not exists penalties_loan_idx        on public.penalties(loan_id);
create index if not exists collections_loan_idx      on public.collections(loan_id);
create index if not exists tickets_customer_idx      on public.tickets(customer_id);
create index if not exists audit_log_at_idx          on public.audit_log(at desc);

-- ---------------------------------------------------------------------
--  Role helpers used by the security policies
-- ---------------------------------------------------------------------
-- Role of the signed-in user: only when their Auth email is CONFIRMED and matches
-- an active staff record (null otherwise).
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public, auth as $$
  select s.role_key
  from public.staff s
  join auth.users u on lower(u.email) = lower(s.email)
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
    and s.active
  limit 1
$$;
revoke all on function public.my_role() from public;
grant execute on function public.my_role() to authenticated;

create or replace function public.is_staff()
returns boolean language sql stable as $$
  select public.my_role() is not null
$$;

-- Super Admin can do everything; otherwise the role must be in the list
create or replace function public.has_role(roles text[])
returns boolean language sql stable as $$
  select public.my_role() = 'admin' or public.my_role() = any(roles)
$$;

-- ---------------------------------------------------------------------
--  Row-level security
--  * Any active staff member can READ everything.
--  * WRITES are limited by role (mirrors the app's RBAC).
--  * Anonymous visitors can do nothing.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['staff','customers','applications','loans','payments','penalties',
                           'collections','tickets','statement_lines','notification_rules','settings','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff can read" on public.%I', t);
    execute format('create policy "staff can read" on public.%I for select to authenticated using (public.is_staff())', t);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('customers',          $p$public.has_role(array['officer','support'])$p$),
    ('applications',       $p$public.has_role(array['officer','verifier','manager','finance'])$p$),
    ('loans',              $p$public.has_role(array['finance'])$p$),
    ('payments',           $p$public.has_role(array['finance'])$p$),
    ('penalties',          $p$public.has_role(array['finance'])$p$),
    ('statement_lines',    $p$public.has_role(array['finance'])$p$),
    ('collections',        $p$public.is_staff()$p$),
    ('tickets',            $p$public.is_staff()$p$),
    ('staff',              $p$public.has_role(array[]::text[])$p$),
    ('notification_rules', $p$public.has_role(array[]::text[])$p$),
    ('settings',           $p$public.has_role(array[]::text[])$p$)
  ) as v(t, cond)
  loop
    execute format('drop policy if exists "role can write" on public.%I', r.t);
    execute format('create policy "role can write" on public.%I for all to authenticated using (%s) with check (%s)', r.t, r.cond, r.cond);
  end loop;
end $$;

-- Audit log: any staff member may ADD entries; nobody may change or delete them.
drop policy if exists "staff can append" on public.audit_log;
create policy "staff can append" on public.audit_log for insert to authenticated with check (public.is_staff());

-- Sender name shown on the phone (e.g. AFRICO). Must be registered with ZICTA / the networks.
alter table public.settings add column if not exists sms_sender text default 'AFRICO';

create table if not exists public.sms_outbox (
  id            text primary key,                       -- SMS-<time>-<random>
  at            timestamptz not null default now(),
  customer_id   text references public.customers(id),
  loan_id       text references public.loans(id),
  phone         text not null,
  rule_id       text not null,                          -- payment / disbursement / upcoming / overdue / test
  message       text not null check (char_length(message) <= 480),
  status        text not null default 'queued' check (status in ('queued','sent','failed','blocked','simulated')),
  provider      text,
  provider_ref  text,
  error         text,
  sent_at       timestamptz,
  recorded_by   text,
  -- MESSAGING POLICY: nothing may ever be queued for WhatsApp.
  constraint sms_not_whatsapp check (rule_id <> 'whatsapp')
);

create index if not exists sms_outbox_at_idx on public.sms_outbox(at desc);
create index if not exists sms_outbox_status_idx on public.sms_outbox(status);

alter table public.sms_outbox enable row level security;

drop policy if exists "staff can read" on public.sms_outbox;
create policy "staff can read" on public.sms_outbox
  for select to authenticated using (public.is_staff());

-- Staff may only QUEUE messages. Status changes are made by the Edge Function
-- (service role), so nobody can mark a message "sent" from the browser.
drop policy if exists "staff can queue" on public.sms_outbox;
create policy "staff can queue" on public.sms_outbox
  for insert to authenticated with check (public.is_staff() and status = 'queued');
