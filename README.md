# ARBM Unified Financing & DSR Calculator

> **Standalone calculator build:** [`calculator/`](calculator/README.md) is a separate,
> self-contained version of this system for evaluation only — double-click `index.html`,
> no server, no admin, no maker/checker, nothing stored in the browser. It is independent
> of the `web/` app described below.

Fully static web app: plain HTML + CSS + vanilla JS (**no build step, no
server, no framework runtime**). The calculation engine (`web/js/engine/`)
is pure, framework-free JS, unit-tested against the master Excel workbooks.
Login, roles, and the maker → checker sign-off workflow are also plain
client-side JS - the "database" is a single JSON object held in the
browser's `localStorage`, so the whole thing can be published to any static
file host (S3, GitHub Pages, Netlify, or just a folder on a web server)
with no backend to run.

## ⚠️ Security note

**There is no server, so there is no real access control.** Everything -
login, roles, the maker/checker split, the audit log - is enforced by the
browser's own JavaScript as a *convention*, not a boundary. Anyone using
the browser's devtools can:

- read `localStorage['dsr_db_v1']` directly, including every password hash
- edit case records, approve/reject decisions, or the audit log by hand
- forge a session by writing to `sessionStorage` themselves

This is an intentional trade-off for a fully static, backend-free build.
Do **not** use this build to hold real customer financing data in a
shared/production setting unless you understand and accept that. If you
need real server-side enforcement, put an actual backend (even a small
serverless one) in front of the JSON store instead of trusting the browser.

## Setup

No install step. From the project root, serve `web/` with any static file
server, for example:

```
python3 serve.py          # recommended while developing
# or
npx serve web
# or
python3 -m http.server 8000 --directory web
```

`serve.py` is the same static server on port 8000, except it sends
`Cache-Control: no-store`. The stock `http.server` sends **no** cache headers,
so browsers heuristically cache `.js` for days and keep running an old build
after you edit a file - which looks exactly like "my change didn't work".
Asset URLs also carry a `?v=` stamp for the same reason; bump it in the
`.html` files when shipping a change to anyone already running the app.

Open `http://localhost:8000/login.html`. Since no accounts exist yet,
you'll see a **"Set up the first admin account"** form - pick a username,
name and password directly (there's no CLI/out-of-band step in a static
app). From there, use **Users** (admin-only) to create `normal` (maker)
and `checker` accounts; new accounts get a random temporary password shown
once on screen, and must change it on first login.

**Password hashing uses the Web Crypto API (`crypto.subtle`), which browsers
only expose in a secure context** - `https://` or `http://localhost`. Local
development (`localhost`) works fine; a real deployment needs HTTPS (most
static hosts, including S3 behind CloudFront, GitHub Pages, and Netlify,
give you this by default). Plain unencrypted `http://` hosting will not work
for login.

## Roles

| Role | Can do |
|---|---|
| `normal` (maker) | Fill in a case (customer/CCRIS/Experian/income/product calc), submit it to a chosen checker, and amend + resubmit anything the checker returns |
| `checker` | Review cases routed to them, then Approve, Reject, or Return to the maker for amendment - each with a comment |
| `admin` | Create/disable users and assign roles, view the full audit log, edit calculation policy settings, see approved/rejected counts across the system. Lands on the **Admin Dashboard** at sign-in - the admin sidebar has no separate "Dashboard" entry, since the admin dashboard is a superset of it |

Only an admin can create accounts or change a user's role - there is no
self-registration (other than the one-time first-admin setup above).

## Modes (left sidebar, inside the calculator)

| Standalone | Combo (one shared CCRIS + income intake) |
|---|---|
| Personal Financing (PF) | PF + CC |
| Home Financing (HF) | HF + CC |
| Credit Card (CC) | PF + HF |

Every mode shows the same mandatory shared intake first:
**Step A** Customer details - read-only, populated from the Experian report;
only **Customer Type** is selectable. Customer Class TYPE A/B is
auto-derived from gross income (TYPE B when >= RM5,000). →
**Step B** CCRIS - Experian PDF drag-and-drop; extracted CCRIS and NLCI rows
are **locked** (only the Override column, plus the Floating stress-test flag,
can be edited). Rows are grouped with coloured border markers: blue = original
CCRIS, dark red = NLCI, orange = manually added (manually added rows stay
fully editable and deletable). Balance-transfer/settlement table below. →
**Step C** Income (NORMAL: 6-month payslip table or EPF/KWSP statement
drag-and-drop; BIZMAN: bank-turnover form).
The product panels unlock once name, IC and income are present. Switching
modes keeps all entered data (shared session state). Combo modes run the same
per-product functions and add one combined commitment/DSR block checked
against the **lower** applicable threshold (conservative default - confirm
policy with Product Development).

## Maker → checker workflow

A maker fills in a case as above, then on the **Maker / Checker Sign-off**
panel picks an active checker and clicks **Submit to Checker** - this saves
the case (customer, CCRIS, income, product results) into the local database
and locks it (no further edits). The chosen checker sees it in **My Queue**,
opens it (read-only, exactly as the maker saw it), and clicks **Approve**,
**Reject**, or **Return to Maker**.

**Return to Maker** is the amendment loop, for when the case is basically
sound but something is wrong - a typo in the IC, a missing income document,
the wrong financing amount. A comment is required: it is what the maker
sees. The case moves to status `returned` and drops out of the checker's
pending queue.

For the maker who owns it, a returned case **opens with the calculator
already unlocked** - no "Edit Case" click first, since the checker sent it
back precisely so it could be changed. They fix what was flagged, then
click **Save & Resubmit** (optionally with a reply), which routes it back to
the same checker as `pending_checker`. **Discard Changes** reloads and
throws away whatever was typed. Everyone else - the checker who returned it,
an admin - still sees the usual read-only record.

This can go round as many times as needed; the case counts how often it was
returned and edited, and the whole exchange is shown as a comment thread on
the sign-off panel and printed with the case.

**Reject** is the terminal outcome - it closes the case for good and it can
never be edited again. Use Return when you want the case fixed, Reject when
you want it dead. A comment is required for both.

Every step - submit, approve, reject, return, resubmit, edit, login,
user/role changes, policy-setting changes - is written to the admin **Audit
Log**. Admin dashboard shows approved/reject counts overall and per maker.

### Case statuses

| Status | Meaning | Who can act |
|---|---|---|
| `pending_checker` | Awaiting sign-off | Checker (approve/reject/return); maker can still edit in place |
| `returned` | Sent back for amendment | Maker only - opens unlocked, then Save & Resubmit |
| `approved` / `rejected` | Decided, read-only for everyone | Nobody - closed audit trail |

### Dates and times

Timestamps are **stored** as UTC ISO strings (`Db.now()`) so they sort
lexicographically and survive an export/import between machines, and
**displayed** in Malaysia time (MYT, a flat UTC+8 with no daylight saving)
via `Db.dateTime()` / `Db.date()` / `Db.today()`. That covers the audit log,
case lists, the sign-off comment thread, the dashboards' daily buckets, the
printed report date and the checker's sign-off date. The SQL report export
keeps the raw stored UTC values.

## The "database": one JSON object in the browser

All app data (users, cases, audit log, calculation policy overrides) lives
in a single JSON object under `localStorage['dsr_db_v1']`, managed by
`web/js/store/db.js`. There is no file on disk and no server round trip -
every page reads/writes this object directly.

**Admin → Calculation Settings** can export/import the *calculation policy
overrides* as JSON.

The whole-database Export/Import buttons were removed from that sidebar. The
functions still exist in `js/store/db.js` (`Db.downloadExport()` /
`Db.importJSON()`), so a full backup/restore is a console call away - but
there is no longer a button for it. **This browser's localStorage is now the
only copy of the data**; the .db/.sql export on the dashboard is a read-only
analysis snapshot, not a restore path. Put the buttons back (or add a proper
backend) before anyone keeps real cases in here.

## Light / dark mode

`js/theme.js` sets `data-theme` on `<html>` from `localStorage['dsr_theme']`,
synchronously in `<head>` so there is no white flash on the way in. **Dark is
the default.** The toggle sits in the sidebar foot of every page.

`login.html` is deliberately excluded (it loads neither `theme.js` nor
`theme-dark.css`): the sign-in screen has its own animated gradient + glass
card and is the same for everyone, signed in or not.

- **dark** - the analytics look, everywhere: dashboards, calculator, tables,
  forms. `css/theme-dark.css` redefines the design tokens and patches the
  handful of places `styles.css` hardcodes a white or grey.
- **light** - the normal banking-ledger look (the base stylesheets on their own).

The **printed report always prints light** whatever the screen is doing - it
is ink on paper. Charts read their colours from the same CSS tokens, so
switching theme reloads the page once to repaint them.

## Dashboards

`dashboard.html` (maker / checker / admin) and `admin/index.html` (system-wide)
share one 12-column panel grid - `css/dashboard.css`, scoped to
`<body class="dash">`. Panels on a row stretch to a common height, so cards
always line up regardless of content. Charts come from `js/charts.js`
(ApexCharts, vendored): stacked gradient area for volume over time, a donut
with an HTML legend for outcomes, rounded bars for weekday load, radial rings
for the product mix, and a sparkline for approved financing.

## Report data: SQL export for analysis

The JSON blob above is the right shape for running a case and the wrong shape
for analysing a portfolio. The **Report data (SQL)** section at the bottom of
the **Admin Dashboard** flattens every stored case into a normalised SQLite
database and offers three things:

- **Download database (.db)** - a real SQLite file, built in the browser by
  `vendor/sql-wasm.js` (sql.js, MIT: SQLite compiled to WebAssembly). Open it
  in DB Browser, Power BI, `sqlite3`, anything.
- **SQL dump (.sql)** - schema + INSERTs, for `sqlite3 report_data.db < dump.sql`.
- **Query box** - runs SELECTs against that same in-browser database, so an
  officer can check the data without downloading anything. Cmd/Ctrl+Enter runs.

**Two keys, every table** (`web/sql/report_schema.sql`, schema_version 2):

| column | meaning |
|---|---|
| `id`  | unique per **row**. Apply for PF twice → two rows, two ids. |
| `cic` | the **customer** key (their IC, digits only), identical in every table. |

So one person's whole file joins on `cic`:

```sql
SELECT product_code, new_instalment, dsr_ratio
FROM loan_application WHERE cic = '010101010001';
```

Foreign keys (`report_id`, `case_id`, `application_id`, ...) still link a row to
its exact parent; `cic` links everything about one human being.

- **Tables** - one per section of the report: subject, credit score, summary
  panels, CCRIS accounts → facility lines → 12-month conduct, special attention,
  credit applications, NLCI, legal suits, bankruptcy, enquiries, shareholding;
  plus the case, its income months, and the product applications.
- **Products** - rows in `loan_application`, each with a row in
  `personal_loan_application` / `home_loan_application` / `credit_card_application`.
- **Combos** - `combo_application` header plus one table per pair, because each
  is scored differently:
  - `combo_pf_cc` - one pot: both instalments on the main applicant's income,
    governed by the **tighter** of the PF and CC thresholds. One row per case.
  - `combo_hf_cc`, `combo_pf_hf` - per applicant: the home instalment split
    evenly, then each person scored on their own income, own L57, own
    card/financing. **One row per applicant per case.** On these cases the
    per-product `dsr_ratio` in `loan_application` is deliberately NULL - the
    ratio the checker saw is the combo row's.
- **Generator** - `web/js/store/reportSql.js`. It never re-decides anything:
  DSR/NDI/verdict are the figures the checker saw, read out of the stored
  snapshot. Only pure engine helpers are called (per-line commitment, PF matrix
  rate, HF term maths, CC limit), so exported numbers match the calculator's.
- **`data_source`** on every table says where a row came from: `EXPERIAN`,
  `MANUAL`, or `DERIVED`. Summary panels are `DERIVED` - recomputed from the
  detail lines, because `pdfExtractor.js` does not read those boxes yet. Tables
  with no extractor behind them are created empty rather than omitted, so
  filling them later needs no migration.

## Layout

```
web/                     docroot - serve this folder as-is, nothing else needed
  index.html               the calculator shell; auth-gated client-side,
                            resumes a case via ?case=ID
  login.html               sign-in, or first-run admin setup if no users exist yet
  dashboard.html cases.html change_password.html   role-aware landing + case list
  admin/                   admin-only: dashboard stats (+ the report-data SQL
                            export section), users, audit log, calc settings
  sql/report_schema.sql    report-data warehouse schema (SQLite) - see above
  css/ js/ data/ vendor/ public/   static assets
  css/dashboard.css        panel/grid layer for the two dashboards, with the
                            LIGHT colour tokens
  css/theme-dark.css       dark values for those tokens + the rest of the app
  js/theme.js              light/dark switch (sets data-theme before paint)
  js/engine/               pure calculation functions (no I/O, unit-tested)
    pmt.js                 PMT, amortising instalment, selling price, PF flat-rate instalment
    age.js                 robust age-from-IC (handles birth years >= 2000)
    facilityRates.js       canonical facility-code -> factor table (PF/HF fuller rules)
    ccrisLine.js            per-line commitment engine + stress test + BT repayment
    income.js               Normal manual / EPF statement / Bizman income
    creditLimit.js           CC iScore multiplier, limit caps, card instalment
    dsrThresholds.js         HF/PF/CC threshold tables + verdict strings + formatters
    hfPricing.js              V10 quotation calcs (Structured / Fixed / PUC / Home One)
    pdfExtractor.js           client-side Experian + EPF statement parsers (pdf.js)
  data/ndiPricing.js       PF NDI profit-rate matrices - PLACEHOLDER (see below)
  js/store/                the local "database" + auth/rbac/audit layer (all client-side)
    db.js                    localStorage-backed JSON store; export/import a full backup
    auth.js                  login/logout/session, Web Crypto password hashing, lockout
    rbac.js                  role gate (redirect/deny on the wrong role)
    audit.js                 append-only audit log
    cases.js                 case repository: submit/find/decide/update/list
    policyConfig.js          calculation policy overrides
    reportSql.js             flattens stored cases into report-data SQL inserts
  js/chrome.js             shared page-to-page sidebar/topbar (role-aware nav)
  js/charts.js             dashboard charts: area / donut / bars / spark / ring
  js/pages/                per-page boot scripts (login, dashboard, cases,
                            changePassword, calculator, admin/*)
  js/state.js              shared in-memory session state (never localStorage
                            during entry - only written to the database on Submit)
  js/caseSync.js           resumes a case on page load; submit/decision calls
                            straight into js/store/cases.js
  js/intake.js             shared intake UI (Steps A-C)
  js/panels.js             PF / HF / CC / combo panels + maker-checker sign-off
  js/app.js                routing + orchestration
  vendor/pdf.min.js        vendored pdf.js (no CDN needed at runtime)
  vendor/sql-wasm.js       vendored sql.js - SQLite in WebAssembly, builds the .db
  vendor/apexcharts.min.js vendored ApexCharts (no CDN needed at runtime)
tests/run-tests.js       147 engine checks vs the specs' dummy data (node tests/run-tests.js)
tests/tests.html         same checks in the browser
```

## Interface conventions

- **One currency, stated once.** Every figure in the app is ringgit, so the
  money columns carry no `RM`: `Engine.formatAmount()` renders bare, right
  aligned, tabular numbers for grids (CCRIS, balance transfer, income), and
  `Engine.formatCurrency()` keeps the `RM` prefix only for standalone figures
  (summary tiles, verdict banners). The printed report states `MYR (RM)` once
  in its header instead of on 40 cells.
- **Numbers right, labels left.** `td.num`/`th.num` right-align together, so a
  column reads as one column.
- **No prose in the chrome.** Panels and cards carry a title and the numbers.
  Explanation belongs in this README, not on every screen; error messages are
  the exception and stay in full.

## Verdict strings

Reproduced exactly as in the Excel tools: `OK`, `DSR BURST`, `NOT ELIGIBLE`,
`EXCEED LIMIT`, plus the pricing notes (`MRTT + FEC within 5%`, ...).

## Data still pending from the Excel (flagged in the UI)

1. **PF NDI profit-rate matrices** (`List` sheet ranges ~AD:CP of the PF
   workbook) - export to `web/data/ndiPricing.js` (structure and lookup
   function are ready; PF currently falls back to a manually entered rate
   with a notice). Grade max amounts (List!BC:BD) likewise.
2. **PF stress factors per collateral type** (List!A28:B32) - currently one
   editable global stress % applied to lines marked Floating = YES.
3. Confirm current SBR value (default 2.75%) and ceiling rate (default 10%).

## Known scope notes

- HF joint-applicant (Applicant A + B Summary) is a fast-follow; v1 is
  single-applicant (flagged in the HF panel).
- HF Business Income / SIP legacy sub-calculators from V10: Bizman income is
  covered by the shared income module; SIP not yet ported.
- Experian PDF extraction is positional/heuristic - always review the parsed
  rows (they stay fully editable; a debug trail prints to the browser console).
- The DSR/verdict figures stored on a submitted case are those the maker's
  browser computed (same engine, same trust model as the previous printed
  PDF report) - there is no separate re-implementation of the calculation
  engine anywhere else.
- No browser storage of in-progress case data: state lives only in memory
  during entry and is written to the local database exactly once, on
  Submit. Policy settings (admin/settings.html) are likewise stored in the
  database, not in a separate `localStorage` key from the old app.
