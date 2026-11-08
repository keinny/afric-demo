# Connecting the app to Supabase

Project: `rgviawgeypvficrnypiv` · URL: `https://rgviawgeypvficrnypiv.supabase.co`

The app talks to Supabase with the **project URL** and the **anon (public) key** only.
It never needs the database password or the `service_role` key — don't put those in the app or in GitHub.

Until the anon key is set, the app keeps running as a browser-only demo (data in localStorage).

## 1. Create the tables

1. Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the whole of [`schema.sql`](schema.sql) → **Run**.
   This creates the tables, indexes, role helpers and row-level security policies.
3. New query → paste [`seed.sql`](seed.sql) → **Run**. This loads the sample customers, loans, payments, staff, etc.

Both files are safe to run again.

## 2. Create your sign-in

Staff sign in with Supabase Auth. A sign-in is linked to a staff record **by email**.

1. **Authentication → Users → Add user → Create new user.** Enter your email and a password, tick *Auto Confirm User*.
2. Link it to the Super Admin staff record (SQL Editor):

   ```sql
   update public.staff set email = 'your-email@example.com' where id = 'AFR-ADM-01';
   ```

3. For other staff: create an Auth user for each person, then either add them on the app's **Employees** page with the
   same email, or update the matching sample record's email as above.

Roles come from `staff.role_key`. The database enforces them, e.g. only Finance (or Super Admin) can record payments
and only the Super Admin can change staff, settings and notification rules.

## 3. Give the app the keys

Supabase → **Project Settings → API**: copy the **Project URL** and the **anon public** key.

**Local testing:** copy `.env.example` to `.env.local`, paste the anon key, then `npm run dev`.

**Live site (GitHub Pages):** GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://rgviawgeypvficrnypiv.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon public key |

Then **Actions → Deploy to GitHub Pages → Run workflow**. The live site will now show a sign-in screen.

## What is enforced in the database

- **Row-level security** on every table: only signed-in, active staff can read; writes are limited by role.
- **Audit log is append-only**: a trigger blocks any update or delete.
- **WhatsApp lock**: `notification_rules` has a check constraint, so the WhatsApp rule can never be enabled.
- **Settings** limits: grace period 0–60 days, late penalty 0–50 %.

## Notes and limits

- Record numbers (receipts, loans, etc.) are generated in the browser from the current count. If two people create a
  record of the same type at the same moment they could get the same number; for production, move numbering into the
  database (sequences).
- Each change is saved straight after it happens; if a save fails (for example, a role that isn't allowed to do that),
  a red message appears at the bottom of the screen and the change is not stored.
- To regenerate `seed.sql` from `src/seed.js`: `npm run seed:sql`.
