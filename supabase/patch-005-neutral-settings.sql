-- ==========================================================================
--  Patch 005: remove the old Africo values from Settings
--
--  Run once in Supabase → SQL Editor. Safe to re-run.
--  Each value is only changed if it still holds the old Africo default,
--  so anything you have already typed in Settings is kept.
-- ==========================================================================
update public.settings
   set client_name    = case when client_name ilike 'Africo%' then 'Loan Company' else client_name end,
       representative = case when representative = 'Titus Katepu' then null else representative end,
       developer      = case when developer = 'Pragma Systems OPC Private Limited' then null else developer end
 where id = 1;

-- The SMS sender column only exists after patch-002-sms.sql; skip quietly if it isn't there yet.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'settings' and column_name = 'sms_sender') then
    update public.settings set sms_sender = 'LOANCOMPANY' where id = 1 and sms_sender = 'AFRICO';
  end if;
end $$;
