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
npm run e2e:cloud  # two-browser cloud sync test against a fake Supabase API
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

## Data storage & cloud sync

- **Always:** data is saved in the browser on each device (works offline).
- **Optional cloud sync (Supabase):** Settings → Cloud sync. Each person signs in with
  email + password; both join one *household* via an invite code. Changes upload
  automatically, arrive on the other device (realtime + periodic check), and
  simultaneous edits are merged record by record (deletions are remembered).
- Setup guide (Portuguese): [`docs/SUPABASE.md`](docs/SUPABASE.md). Database script:
  [`supabase/setup.sql`](supabase/setup.sql) — Row Level Security means only
  household members can read their data; all writes go through checked functions.
- For hosting (e.g. Vercel) set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  so devices don't need to paste them.
- Without cloud sync, use **Download backup / Restore backup** to move data.

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
