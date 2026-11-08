# Afric Demo – Loan Management

A browser-only demo of a loan management system, built with React, Vite and Recharts.
All data lives in the visitor's browser (localStorage); use **Reset demo data** in the sidebar to start over.

## Features

- **Dashboard** – customers, applications, active and overdue loans, money disbursed, outstanding and collected, plus charts for disbursements, collections, pipeline and product mix.
- **Customers** – register borrowers and see their open balances.
- **Applications** – capture an application, tick a 6-point verification checklist, approve or reject, then disburse.
- **Loans** – repayment schedule per loan (flat or reducing-balance interest), arrears and days late.
- **Repayments** – record Mobile Money, bank or cash payments; searchable ledger.
- **Roles** – switch between Administrator, Loan Officer, Verification Officer, Credit Manager and Finance Officer to see who can do what.
- **Activity log** – every action with user, role and time.

## Run locally

```bash
npm install
npm run dev
```

## Customise

Branding, loan products, interest rates, roles and the checklist are in `src/config.js`.
Sample data is in `src/seed.js`.

## Deploy

Every push to `main` builds and publishes to GitHub Pages via `.github/workflows/deploy.yml`.
If you rename the repository, update `base` in `vite.config.js` to match.
