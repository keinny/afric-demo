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

## 4. Security hardening (do this)

1. **Run [`patch-001-harden-roles.sql`](patch-001-harden-roles.sql)** in the SQL Editor (only needed if you ran
   `schema.sql` before this patch existed). A sign-in now only gets a role when its email is **confirmed**.
2. **Turn off public sign-up:** Authentication → **Sign In / Providers** → turn off **Allow new users to sign up**.
   Staff accounts are then only created by an admin in Authentication → Users.
3. Keep **Confirm email** switched on.
4. Reset the database password if it was ever shared, and never put the `service_role` / secret key in the app or GitHub.

## 5. SMS (provider-neutral)

The app queues SMS in the `sms_outbox` table; the **`send-sms` Edge Function** sends them through whichever
provider you configure. Provider keys are Supabase secrets – they never reach the browser.

**a) Database:** run [`patch-002-sms.sql`](patch-002-sms.sql) in the SQL Editor (only if your schema predates it).

**b) Deploy the function:** Supabase → **Edge Functions → Deploy a new function → Via Editor**, name it
**`send-sms`**, paste the contents of [`functions/send-sms/index.ts`](functions/send-sms/index.ts) and deploy.
(Or with the Supabase CLI: `supabase functions deploy send-sms`.) Keep **"Verify JWT"** on.

**c) Choose the provider:** Edge Functions → **Secrets** → add `SMS_PROVIDER` and that provider's keys:

| `SMS_PROVIDER` | Other secrets | Notes |
| --- | --- | --- |
| `test` *(default)* | – | Nothing is sent; messages show as "TEST · NOT DELIVERED". Use this first. |
| `http` | `SMS_HTTP_URL`, `SMS_HTTP_HEADERS`, `SMS_HTTP_BODY`, optional `SMS_HTTP_METHOD`, `SMS_HTTP_CONTENT_TYPE` | For **Zamtel Bulk SMS** or any local Zambian provider. Fill in from their API docs. |
| `africastalking` | `AT_USERNAME`, `AT_API_KEY` | Username `sandbox` uses their test environment. |
| `twilio` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, optional `TWILIO_FROM` | ~$0.39 per SMS segment to Zambia. |

`http` example (adjust to your provider's documentation – this is only the shape):

```
SMS_HTTP_URL          = https://api.your-provider.co.zm/v1/sms/send
SMS_HTTP_HEADERS      = {"Authorization":"Bearer YOUR_PROVIDER_API_KEY"}
SMS_HTTP_CONTENT_TYPE = application/json
SMS_HTTP_BODY         = {"sender":"{{sender}}","to":"{{to}}","message":"{{message}}"}
```

Placeholders: `{{to}}` (+260971234567), `{{to_local}}` (0971234567), `{{to_digits}}` (260971234567),
`{{message}}`, `{{sender}}` (the sender name from the app's Settings).

**d) Test:** in the app → **Settings → Send a Test SMS**. The result appears there and in
**Notifications → SMS Outbox**. Failed messages can be retried from the outbox.

**What sends SMS:** recording a payment and disbursing a loan (if those notification rules are on), the
**Send SMS reminders** button on Repayments & EMI (overdue / upcoming), and the test button.
Messages are kept to one 160-character segment where possible. WhatsApp is blocked at every level.

**Before going live:** register the sender name (e.g. `AFRICO`) with ZICTA and the networks through your
provider – MTN also whitelists sender names and message content.

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
