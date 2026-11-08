-- =====================================================================
--  Patch 001 – only CONFIRMED sign-ins get a staff role
--
--  Run once in Supabase → SQL Editor (safe to run again).
--  Before: a role was granted to any signed-in user whose email matched a
--  staff record. If public sign-up is on and email confirmation were ever
--  switched off, someone could register with a staff member's email and
--  inherit that role.
--  After: the role is only granted when the Auth user's email is confirmed
--  and it matches an active staff record.
-- =====================================================================

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

-- Ordinary users don't need to call this directly; policies use it.
revoke all on function public.my_role() from public;
grant execute on function public.my_role() to authenticated;
