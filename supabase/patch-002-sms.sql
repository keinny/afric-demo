-- =====================================================================
--  Patch 002 – SMS outbox (provider-neutral)
--
--  Run once in Supabase → SQL Editor (safe to run again).
--  The app adds rows here; the send-sms Edge Function sends them through
--  whichever provider is configured and records the result.
-- =====================================================================

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
