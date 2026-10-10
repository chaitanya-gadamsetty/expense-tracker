# Expense Tracker

Personal household expense tracker. Paste a bank/UPI/card SMS (plus a few words of your own), speak, or type an expense; confirm it on a card; see where the money goes against monthly budgets. Installable web app (PWA) for iPhone, Android and Mac. See [REQUIREMENTS.md](REQUIREMENTS.md) for scope and decisions.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173/expense-tracker/
npm test           # SMS + voice parsers, budgets, spikes, recurring, backup tests
npm run build      # production build in dist/
```

## How it works

- **No AI, no server.** Parsing is rule-based (`src/lib/sms.ts`, `src/lib/spoken.ts`) and every entry is confirmed on a card before saving.
- **Data** is stored in the browser (IndexedDB via Dexie) on each device. Each person who opens the link gets their own empty app.
- **Sync** (Settings → Google Drive sync): one shared household file, `Expense Tracker/Expense Tracker household.json`, in the first person's Drive, shared with the partner's Google account. Scope is `drive.file` only. The partner links once via Google's file picker. See `src/sync/`.
- **Privacy:** only the last 3–4 digits of accounts/cards are kept; raw SMS text and UPI payee names are never stored.
- **Every record** has `updatedAt` and a `deleted` tombstone flag, so backup restore (and later Drive sync) merges record-by-record.

## Rules worth knowing

| Rule | Value | Where |
|---|---|---|
| Budget warnings | 80% and 100%, calendar month | `src/lib/stats.ts` |
| Spike alert | category month-to-date > 1.5× its 3-month average at the same day; needs 3 months of history; ignored under ₹1,000 | `src/lib/stats.ts` |
| Recurring alerts | show 5 days before due; an expense pays one if same merchant (not "UPI"), or same category within ±25% of the amount, dated ≤10 days before due | `src/lib/recurring.ts` |
| Duplicate warning | same amount + date + merchant | `src/lib/stats.ts` |
| Merchant memory | last category used for that merchant; never for "UPI" | `src/lib/stats.ts` |
| Investment guard | SIP, NACH, MF, RD, FD, PPF, NPS, Zerodha, Groww, ICCL, BSE StAR, CAMS, KFin… | `src/lib/sms.ts` |

## Layout

| Path | What |
|---|---|
| `src/lib/sms.ts` | Bank / card / UPI SMS → amount, date, merchant, method, masked account, your note |
| `src/lib/spoken.ts` | "450 vegetables today" → amount, date, method, what |
| `src/lib/entry.ts` | Text → draft (category from memory/keywords), save |
| `src/lib/categories.ts` | Preset categories, keyword hints, merchant name cleanup |
| `src/lib/stats.ts` | Month/year stats, budgets, spikes, duplicates, date ranges |
| `src/lib/snapshot.ts` | Whole-database snapshot + record-level merge (backup and sync) |
| `src/lib/backup.ts` | Zip backup / merge restore, CSV export |
| `src/sync/*` | Google sign-in (redirect), Drive client, picker, sync pass, React provider; IDs in `config.ts` |
| `src/db.ts` | Database schema and all writes |
| `src/pages/*` | Home, History, Stats, Budgets, Settings |

## Adding a bank SMS format

Paste a masked real sample into `src/lib/sms.test.ts` with the expected result, run `npm test`, then adjust `src/lib/sms.ts` until it passes.

## Google Cloud setup (one time)

Same project and OAuth client as the donation tracker.

1. **APIs & Services → Credentials → the OAuth client → Authorized redirect URIs:** add `https://chaitanya-gadamsetty.github.io/expense-tracker/` (and `http://localhost:5181/expense-tracker/` for local testing). Origins `https://chaitanya-gadamsetty.github.io` / `http://localhost:5181` under Authorized JavaScript origins.
2. **APIs & Services → Library:** enable **Google Picker API** (Google Drive API is already on).
3. **Credentials → Create credentials → API key:** restrict to HTTP referrers `https://chaitanya-gadamsetty.github.io/*` and `http://localhost:5181/*`, and to the Picker API. Put it in `src/sync/config.ts` as `PICKER_API_KEY`.
4. **OAuth consent screen → Test users:** add the partner's Gmail (and anyone else who will sync).
