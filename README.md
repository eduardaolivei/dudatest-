# Our Money Dashboard

A personal & couple finance app for a household in Australia (AUD, DD/MM/YYYY,
July–June financial year). Built with React, TypeScript, Tailwind CSS and Recharts.
Installable on iPhone as a Progressive Web App.

## Run it

```bash
npm install
npm run dev        # development server → http://localhost:5173
npm test           # 25 unit tests for the financial calculations
npm run build      # type-check + production build into dist/
npm run e2e        # browser test of the main flows (needs `npm run build` first)
npm run preview    # serve the production build → http://localhost:4173
```

## What's inside

| Screen | What it does |
|---|---|
| **Home** | Income, expenses, available balance, upcoming bills, card debt, savings, remaining budget, cash flow, *Financial Health*, 5 charts |
| **Transactions** | Search, filter by type/category/month/person, edit, duplicate, delete, CSV |
| **Bills** | Bills Calendar (list + month grid), due this week / month, overdue, mark paid, skip |
| **Cards** | Many cards: limit, available credit, utilisation, statement, due date, minimum, interest estimate, history, instalments |
| **Goals** | Target, saved, monthly contribution, forecast date, required monthly, 12-month projection |
| **Our Week** | Start-of-week money, expected salaries, bills, spending, projected end, **How Much Can We Spend?** |
| **Things We Want to Buy** | Wishlist with savings needed and "can we afford it?" verdicts |
| **Budgets** | Monthly limit per category |
| **Income & Recurring** | Salaries / rent / subscriptions (weekly → yearly), expected vs received |
| **Reports** | Monthly, weekly, income statement, breakdown, cards, savings, Australian FY, month-vs-month, couple — CSV + PDF |
| **Money Assistant** | Answers questions from your data only; smart alerts |
| **Settings** | Names, light/dark/auto, backup/restore JSON, CSV export, demo data, erase |

The **+** button (bottom-right on mobile) opens *Add Transaction* with shortcuts for
Expense, Income, Bill, Card purchase, Card payment and Transfer.

## Money rules (how the numbers are calculated)

- All amounts are stored as **integer cents** — no floating-point rounding errors.
- **Spending** = paid bank expenses + credit-card purchases + card interest/fees.
- A **card payment** lowers the bank balance *and* the card debt but is **never**
  counted as spending again (the purchases already were).
- **Transfers** between our accounts are neither income nor spending.
- **Available balance** = bank + cash accounts. Savings accounts and credit limits are excluded.
- **Safe to spend** = available balance − unpaid bills & card statements due in the period
  − goal contributions − planned purchases due. **Expected income is shown separately
  and never counted until you confirm it was received.**
- Recurring items never pay themselves: each occurrence waits for you to tap *Paid* / *Received*.

## Data storage — please read

The current version stores data **in the browser on each device** (`localStorage`).
It survives refreshes and restarts, but it is **not synced** between phones and computers.

- Move data between devices with **Settings → Download backup / Restore backup**.
- Clearing Safari website data or deleting the home-screen app can erase local data.
  Download a backup regularly.

### Cloud sync (next step)

To share the same data on both phones and the computer, the app needs a hosted
database with login. The code is ready for this: everything goes through the
`StorageAdapter` interface in `src/store/storage.ts`. The recommended plan:

1. Create a free **Supabase** project (Postgres + authentication, Sydney region available).
2. Enable email login. Create one *household* that both of you belong to, with
   row-level security so only household members can read or write its rows.
3. Implement a `cloudAdapter` with the same `load`/`save` methods, which you sign into on both devices.
4. Host the built `dist/` folder on Vercel or Netlify (HTTPS is required for the PWA).

This needs your own Supabase account and keys, which is why it isn't switched on here.

## Install on iPhone

Open the hosted URL in **Safari → Share → Add to Home Screen**. It opens full-screen and works offline.

## Privacy

No bank passwords, full card numbers, CVVs or account/BSB numbers are requested or stored.
Nothing is sent to any server in the local version. Demo data is fictional and every
demo record is labelled “(demo)”; remove it from Settings.

## Project structure

```
src/
  domain/      pure logic: types, money, dates, finance calculations, reports, assistant (+ tests)
  store/       state (React Context), actions, storage adapter, demo data
  components/  reusable UI: layout, forms, charts, modals
  pages/       one file per screen
e2e/           Playwright end-to-end smoke test
public/        PWA manifest, service worker, icons
```
