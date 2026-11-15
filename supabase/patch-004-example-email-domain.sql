-- ==========================================================================
--  Patch 004: move sample staff emails to @example.com
--
--  Run once in Supabase → SQL Editor. Safe to re-run and safe whether or not
--  patch-003 was run: it converts both @africo.demo and @loan.com addresses.
--
--  Why: @loan.com is a real domain owned by someone else. If Supabase ever sent
--  a password-reset or confirmation email to a staff login, it would go to that
--  company. example.com is reserved for examples and never receives mail.
--
--  Staff records and their sign-in accounts are renamed together so each
--  sign-in still finds its staff profile. Passwords are unchanged.
--  Your own login (e.g. admin@admin.com) is not touched.
-- ==========================================================================
begin;

update public.staff
   set email = regexp_replace(lower(email), '@(africo\.demo|loan\.com)$', '@example.com')
 where lower(email) ~ '@(africo\.demo|loan\.com)$';

update auth.users
   set email = regexp_replace(lower(email), '@(africo\.demo|loan\.com)$', '@example.com'),
       updated_at = now()
 where lower(email) ~ '@(africo\.demo|loan\.com)$';

update auth.identities
   set identity_data = jsonb_set(identity_data, '{email}',
         to_jsonb(regexp_replace(lower(identity_data->>'email'), '@(africo\.demo|loan\.com)$', '@example.com'))),
       updated_at = now()
 where provider = 'email'
   and lower(identity_data->>'email') ~ '@(africo\.demo|loan\.com)$';

commit;
