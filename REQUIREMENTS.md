# Expense Tracker — Requirements v0.8

_Last updated: 2026-10-10 · Status: v0.8 signed off 2026-10-10 · v1 (local) built; GitHub Pages deploy + Drive sync (v1.1) next_

## 1. Problem Statement
Our household spends 150+ times a month across UPI, bank and cards. I want to stay in control: know where money goes, stay inside monthly budgets, and catch recurring bills. Entering expenses has to be effortless. My earlier Google AI Studio attempt **was unreliable and threw a lot of errors**, so reliability is the #1 non-functional requirement.

## 2. Users
- **Me + spouse**, each on our own iPhone; me also on MacBook.
- v1: each device works locally. v1.1: both sync through one shared Google Drive folder.

## 3. Jobs to be Done
| When… | I want to… | So that… |
|---|---|---|
| I get a debit/UPI/card SMS | copy it, add a few words ("dinner with team"), and paste | it's logged in <10s with amount, date, merchant filled in |
| I've just paid cash | say or type "spent 450 on vegetables today" | nothing gets missed |
| Mid-month | see budget used per category and overall | I can slow down before overspending |
| Month/year end | see category, merchant and Essential/Need/Want/Waste splits | I know where to cut |
| A recurring bill is due | see an alert that clears once it's logged | I don't miss or double-pay |

## 4. Success Metrics
- **Reliability:** zero crashes or data loss; every parser path covered by automated tests (built from real SMS samples)
- **Entry speed:** paste-SMS or voice to saved in ≤10s, ≤2 taps after paste
- **Parse accuracy:** ≥90% of pasted SMS saved with no field corrections
- **Control:** monthly spend vs budget visible in 1 tap from home
- **Running cost:** ₹0/month

## 5. Requirements

### 5.1 Must-have (v1)

**Reliability (non-functional)**
- Rule-based, deterministic parsing. No AI/LLM calls, no server.
- Every parse goes to a **confirmation card**, so nothing is saved unseen. Missing or ambiguous fields open Quick-add pre-filled.
- Unit tests for parsers, budget math, recurring logic and backup/restore. CI must pass before deploy.
- Never lose data: local IndexedDB, `updatedAt` on every record, deletes kept as tombstones.

**Entry method 1: paste SMS + narrative**
- One text box: paste the transaction SMS, optionally followed by my own words (e.g. "dinner with Ravi").
- Parses bank debit, UPI (GPay / PhonePe / Paytm) and credit-card SMS from **HDFC, ICICI, SBI, Axis, Kotak** (more added from samples).
- Extracts amount, date, merchant/VPA, account/card **last 4 digits only**, and debit vs credit. Credit/refund messages are flagged and not saved as expenses.
- **Reference formats (real samples, used as test fixtures):**
  - HDFC credit card: `Spent Rs.1044 On HDFC Bank Card 1762 At SWIGGY E COM On 2026-10-10:15:48:47.Not You? …` → ₹1,044 · 10 Oct 2026 · merchant "Swiggy" · method "Card ••1762 (HDFC)"
  - ICICI UPI debit: `ICICI Bank Acct XX035 debited for Rs 93.00 on 09-Oct-26; SHASHANK GUPTA credited. UPI:101514865918. …` → ₹93 · 9 Oct 2026 · merchant **"UPI"** · method "UPI (ICICI ••035)"
  - HDFC credit card via UPI (multi-line): `Txn Rs.40.00 / On HDFC Bank Card 6707 / At paytmqr6j4c2e@ptys / by UPI 510010238301 / On 10-10` → ₹40 · 10 Oct (year missing → current year; if that would be in the future, previous year) · merchant **"UPI"** · method "UPI (HDFC Card ••6707)"
- **All UPI payments default merchant to "UPI"**, whether the payee is a person's name or a VPA/QR handle (e.g. `paytmqr…@ptys`). I edit the merchant later when needed.
- **UPI person-to-person payee names are ignored**: merchant is set to "UPI" and the person's name is not stored. My narrative supplies the context (e.g. "vegetables").
- Merchant names are cleaned for display ("SWIGGY E COM" → "Swiggy", "Flipkart Internet PVT" → "Flipkart") using a small alias list plus title-casing.
- Other banks (SBI, Axis, Kotak) and UPI apps: generic debit patterns ("debited", "spent", "paid", "sent Rs") until real samples are added.
- Narrative becomes the note; keywords in it can set category (e.g. "groceries", "petrol").
- **Investment guard:** if the SMS looks like a SIP, RD, FD, PPF, mutual fund or NACH/auto-debit to an investment (keywords: SIP, NACH, mutual fund, MF, RD, recurring deposit, FD, PPF, NPS, Zerodha, Groww, etc.), the confirmation card warns "Looks like an investment, not an expense" with **Discard** as the primary action. "Save anyway" stays available.
- **Duplicate guard:** warn if same amount + date + merchant already exists (e.g. both bank and UPI SMS for one payment).
- Raw SMS is **not stored**; only extracted fields are kept.

**Entry method 2: voice / text + Quick-add**
- Same pattern as the donation app: mic (browser speech-to-text) or text box, then the rule-based parser, then a confirmation card.
- Phrasings: "spent 450 on Swiggy yesterday", "1.2K petrol today", "paid rent 25000 on 1st".
- Amounts like 450, 1K, 1.5k, 1 lakh, ₹5,000, "five hundred". Dates: today, yesterday, "on 5th", "5 Oct".
- Quick-add form: amount, date (default today), category, merchant (searchable, add new), spend type, paid by, note.

**Expense fields**
- Amount (INR, shown as ₹1,20,000), date, category, merchant, **spend type** (Essential / Need / Want / Waste), **paid by** (Me / Spouse), note.
- **Payment method:** Card / UPI / Cash / Bank transfer / Other, plus optional account label (e.g. "HDFC ••1762"). Auto-filled from SMS; voice/quick-add defaults to UPI, editable.

**Categories (Indian preset, editable)**
Groceries, Food & Dining, Transport & Fuel, Rent & EMI, Utilities & Bills, Shopping, Health, Education, Kids, Travel, Entertainment, Subscriptions, Household Help, Gifts, Others.
- Each category has an **icon (emoji) + colour**; add, rename, recolour, archive custom categories (archive, not delete, so history stays intact).
- Each category has a **default spend type** (e.g. Rent → Essential, Groceries → Need, Dining → Want). Override it per expense. Waste is always set by hand.
- **Merchant memory:** the app remembers the last category for each merchant and pre-fills it next time. **Not applied to "UPI"** (too generic). For UPI, the category comes from narrative keywords, otherwise I pick it on the confirmation card.

**Paid by**
- Person names are editable in Settings (default "Me" / "Spouse"), so another household can rename them.
- Each device is tagged once in Settings as "Me" or "Spouse". New entries default to that and can be edited.

**Budgets & alerts**
- Monthly budget per category plus an overall monthly budget, in **calendar months**.
- **Default: overall household budget ₹1,00,000/month**; category budgets start blank (optional).
- Progress bars on home. In-app warning at 80% (amber) and 100% (red), also shown on the confirmation card when a save would cross a threshold.
- **Spike alert (rule-based):** banner when a category's month-to-date spend exceeds 1.5× its 3-month average for the same point in the month (needs 3 months of history; silent until then).
- No push notifications.

**Recurring expenses**
- Define a recurring item: name, amount, category, merchant, cadence (monthly / quarterly / yearly), next due date.
- In-app **Due / Overdue alerts** on home, appearing 5 days before due.
- Logging a matching expense (same merchant or category and similar amount, or "Mark paid" from the alert) **clears the alert** and rolls the due date forward.

**Views / dashboard**
- **Metric cards (month):** Total spent · Remaining budget · Daily average · Top category.
- **Charts:** daily spend trend (bar) and category share (donut with %).
- **Recent transactions** feed on home with category icons and relative dates ("Today", "Yesterday", "3 days ago"); tap opens detail/edit.
- **Default scope: whole household** on every device; filter by person is one tap away.
- **Month view (default):** total vs budget, by category, by spend type, by person, top merchants, daily list.
- **Year view:** month-by-month trend, category totals, spend-type split. Year and month switcher.
- History: keyword search; filters for category, spend type, person, merchant; date range presets **This month · Last 30 days · Year to date · Custom**; edit and delete with instant recalculation.

**Backup**
- Export: zip (full restore) and CSV (spreadsheet). Restore merges by `updatedAt` (same as the donation app).

**Platform**
- PWA (install to home screen on iPhone; works offline), React + TypeScript + Vite + Dexie. Free hosting on GitHub Pages.
- Visual design reuses the donation-tracker design system.
- **Supported devices:** iPhone (Safari, installed to home screen), **Android (Chrome, installed)**, MacBook (Chrome/Safari). Same features on all; bank SMS text is identical across phones.
- **Android bonus (nice-to-have):** the installed app can appear in Android's Share menu, so the spouse can share an SMS straight into it without copy-paste. iPhone does not support this for web apps.
- **Navigation:** bottom tab bar on iPhone (Home · History · Stats · Budgets · Settings); same tabs as a left sidebar on MacBook widths.
- **Settings hub:** grouped cards (Categories · Budgets · Recurring · Device owner · Backup) with drill-down screens and back headers.
- Mobile polish: ≥44px touch targets, no text clipping or wrapping buttons, amounts never truncated.

### 5.2 v1.1
- **Google Drive sync** through one shared folder for me + spouse (reuse the donation app's sync once proven). Record-level merge, tombstones.
- Shared settings (categories, budgets, recurring) sync too.

### 5.3 Nice-to-have (later)
- Receipt photo attachment (proof only)
- Bank/UPI statement CSV import with dedupe
- Salary-cycle months
- iOS Shortcut: share an SMS straight into the app

### 5.4 Out of scope
Income tracking, **savings/investments (SIP, RD, FD, PPF): these go in a separate Savings app built later on the same template**, other currencies, automatic SMS/email reading (not possible for a web app on iPhone), OCR, real-time multi-user backend, push notifications, investments/net worth.

## 5.5 Cross-reference: SpendWise (AI Studio) prompt
| SpendWise item | Decision | Why |
|---|---|---|
| Firebase Auth + Firestore, real-time | **Dropped** | Server, accounts and network dependency add failure points; Drive sync (v1.1) keeps ₹0 and data in our hands |
| AI voice parsing | **Dropped** | No LLM at this stage; rule-based parser instead |
| Multi-currency | **Dropped** | INR only |
| Custom categories with icons/colours | **Adopted** | |
| Metric cards, trend + donut charts, recent feed | **Adopted** | |
| Date-range presets in history | **Adopted** | |
| Budget thresholds (75% / over) | **Adopted as 80% / 100%** | |
| Unusual-spike alerts | **Adopted, rule-based** | |
| Bottom nav (mobile) / sidebar (desktop), Settings hub | **Adopted** | |
| Payment method field | **Adopted** | Card / UPI / Cash / Bank / Other, auto-filled from SMS |
| Receipt tag | Deferred (nice-to-have) | |

## 5.6 Sharing the app with other people
- The app is a public link with no accounts. Each phone or browser keeps its own data, so **anyone I share the link with starts with an empty app and never sees my data**, and I never see theirs.
- Each person or household keeps their own backups. From v1.1, each connects **their own** Google Drive; only people who share a Drive folder see each other's expenses.
- First-run setup lets a new user set person names, the monthly budget (default ₹1,00,000) and categories.

## 6. Privacy
- Data stays on my devices (and our own Google Drive from v1.1). No third-party servers or analytics.
- Account and card numbers are stored as **last 4 digits only**. Raw SMS text is discarded after parsing.

## 7. Decisions log (2026-10-10)
- SMS samples: HDFC card, ICICI UPI, HDFC card-on-UPI provided (see 5.1); all UPI merchants default to "UPI", editable.
- Merchant memory not applied to "UPI": agreed.
- Payment method: kept.
- Default view: household.
- Categories: general preset as listed in 5.1, editable.
- Budget: ₹1,00,000/month overall; category budgets blank.
- Spike threshold: 1.5×.
- Savings: separate app later; this app is expenses only. SIP/RD/FD payments are not logged here.
- Investment guard: yes, warn on SIP/RD/investment SMS (not an expense).
- Devices: spouse may use iPhone or Android; both supported.
- Sharing: other people can use the same link independently; data is never merged unless they share a Drive folder (v1.1).

## 8. Open Questions
1. More SMS samples (SBI, Axis, Kotak, HDFC savings/UPI, GPay/PhonePe) can be added any time to improve parsing; not blocking.
