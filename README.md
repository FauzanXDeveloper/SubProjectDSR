# ARBM Unified Financing & DSR Calculator

Web app: plain HTML + CSS + vanilla JS calculator (**no build step, no JS
framework runtime**) backed by a small **PHP + SQLite** application layer for
login, roles, and the maker → checker sign-off workflow. The calculation
engine itself (`web/js/engine/`) is pure, framework-free JS, unit-tested
against the master Excel workbooks.

## Setup

Requires PHP 8.1+ (SQLite/PDO support is built in - no separate database
server to install). On macOS:

```
brew install php
```

Then, from the project root:

```
php bin/seed_admin.php                 # creates storage/dsr.sqlite + the first admin account
                                        # (prints a one-time temporary password - note it down)
php -S localhost:8000 -t web           # serves web/ as the docroot
```

Open `http://localhost:8000/login.php`, sign in with the seeded admin
account, and change the temporary password when prompted. From there, use
**Users** (admin-only) to create `normal` (maker) and `checker` accounts.

## Roles

| Role | Can do |
|---|---|
| `normal` (maker) | Fill in a case (customer/CCRIS/Experian/income/product calc), submit it to a chosen checker |
| `checker` | Review cases routed to them, Approve or Reject with notes |
| `admin` | Create/disable users and assign roles, view the full audit log, edit calculation policy settings, see approved/rejected counts across the system |

Only an admin can create accounts or change a user's role - there is no
self-registration.

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
panel picks an active checker and clicks **Submit to Checker** - this posts
the case (customer, CCRIS, income, product results) to the database and
locks it (no further edits). The chosen checker sees it in **My Queue**,
opens it (read-only, exactly as the maker saw it), and clicks **Approve** or
**Reject** (a reason is required to reject). Every step - submit, approve,
reject, login, user/role changes, policy-setting changes - is written to the
admin **Audit Log**. Admin dashboard shows approved/reject counts overall
and per maker.

## Layout

```
web/                     PHP docroot (php -S ... -t web) - only this is served
  index.php                the calculator shell (was index.html); auth-gated,
                            resumes a case via ?case=ID, injects config/CSRF/checkers
  login.php logout.php change_password.php
  dashboard.php cases.php  role-aware landing + case list
  admin/                   admin-only: dashboard stats, users, audit log, calc settings
  api/                     case_submit.php, checker_decision.php, config_save.php
  css/ js/ data/ vendor/ public/   static assets (unchanged from the original app)
  js/engine/               pure calculation functions (no I/O, unit-tested)
    pmt.js                 PMT, amortising instalment, selling price, PF flat-rate instalment
    age.js                 robust age-from-IC (handles birth years >= 2000)
    facilityRates.js       canonical facility-code -> factor table (PF/HF fuller rules)
    ccrisLine.js           per-line commitment engine + stress test + BT repayment
    income.js              Normal manual / EPF statement / Bizman income
    creditLimit.js         CC iScore multiplier, limit caps, card instalment
    dsrThresholds.js       HF/PF/CC threshold tables + verdict strings + formatters
    hfPricing.js           V10 quotation calcs (Structured / Fixed / PUC / Home One)
    pdfExtractor.js        client-side Experian + EPF statement parsers (pdf.js)
  data/ndiPricing.js       PF NDI profit-rate matrices - PLACEHOLDER (see below)
  js/state.js              shared in-memory session state (never localStorage)
  js/caseSync.js           resumes a case from the server; submit/decision API calls
  js/intake.js             shared intake UI (Steps A-C)
  js/panels.js             PF / HF / CC / combo panels + maker-checker sign-off
  js/app.js                routing + orchestration
  vendor/pdf.min.js        vendored pdf.js (no CDN needed at runtime)
app/                     PHP application code (not web-accessible)
  Db.php Auth.php Rbac.php Csrf.php Audit.php Http.php Cases.php PolicyConfig.php
migrations/schema.sql   database schema (SQLite; auto-applied on first run)
storage/dsr.sqlite      the database file (gitignored, created at runtime)
bin/seed_admin.php      one-time CLI: creates the database + first admin account
tests/run-tests.js      147 engine checks vs the specs' dummy data (node tests/run-tests.js)
tests/tests.html        same checks in the browser
```

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
  PDF report) - there is no separate server-side re-implementation of the
  calculation engine in this pass.
- No browser storage of case data: state lives only in memory during entry
  and is written to the database exactly once, on Submit; every
  authenticated page is sent with `Cache-Control: no-store`. Policy settings
  (admin/settings.php) similarly moved from `localStorage` to the database.
