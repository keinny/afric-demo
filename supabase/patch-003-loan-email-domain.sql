-- ==========================================================================
--  Patch 003: move staff emails from @africo.demo to @loan.com
--  Run once in Supabase → SQL Editor. Safe to re-run (only touches
--  addresses still ending in @africo.demo). Passwords are unchanged.
--  Staff records and their sign-in accounts are renamed together so
--  each sign-in still finds its staff profile.
-- ==========================================================================
begin;

update public.staff
   set email = replace(lower(email), '@africo.demo', '@loan.com')
 where lower(email) like '%@africo.demo';

update auth.users
   set email = replace(lower(email), '@africo.demo', '@loan.com'),
       updated_at = now()
 where lower(email) like '%@africo.demo';

update auth.identities
   set identity_data = jsonb_set(identity_data, '{email}',
         to_jsonb(replace(lower(identity_data->>'email'), '@africo.demo', '@loan.com'))),
       updated_at = now()
 where provider = 'email'
   and lower(identity_data->>'email') like '%@africo.demo';

commit;
