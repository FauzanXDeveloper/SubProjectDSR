# ARBM Unified Financing & DSR Calculator

Static web app (plain HTML + CSS + vanilla JS - **no Node.js server, no build
step, no framework runtime**) built from the spec files in this folder per
`05_MASTER_BUILD_COMMAND.txt`. Everything runs in the browser; open
`index.html` directly or host the folder on any static file server.

## Modes (left sidebar)

| Standalone | Combo (one shared CCRIS + income intake) |
|---|---|
| Personal Financing (PF) | PF + CC |
| Home Financing (HF) | HF + CC |
| Credit Card (CC) | PF + HF |

Every mode shows the same mandatory shared intake first:
**Step A** Customer details - read-only, populated from the Experian report
(or a saved session .json); only **Customer Type** is selectable. Customer
Class TYPE A/B is auto-derived from gross income (TYPE B when >= RM5,000). →
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

## Layout

```
index.html               shell + sidebar + routing (#/pf, #/hf, #/cc, #/pf-cc, #/hf-cc, #/pf-hf)
css/styles.css           ARBM palette; yellow=editable / blue=calculated / orange=override
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
js/state.js              shared session state + Export/Import JSON
js/intake.js             shared intake UI (Steps A-C)
js/panels.js             PF / HF / CC / combo panels + maker-checker sign-off
js/app.js                routing + orchestration
vendor/pdf.min.js        vendored pdf.js (no CDN needed at runtime)
tests/run-tests.js       63 engine checks vs the specs' dummy data (node tests/run-tests.js)
tests/tests.html         same checks in the browser
```

## Verdict strings

Reproduced exactly as in the Excel tools: `OK`, `DSR BURST`, `NOT ELIGIBLE`,
`EXCEED LIMIT`, plus the pricing notes (`MRTT + FEC within 5%`, ...).

## Data still pending from the Excel (flagged in the UI)

1. **PF NDI profit-rate matrices** (`List` sheet ranges ~AD:CP of the PF
   workbook) - export to `data/ndiPricing.js` (structure and lookup function
   are ready; PF currently falls back to a manually entered rate with a
   notice). Grade max amounts (List!BC:BD) likewise.
2. **PF stress factors per collateral type** (List!A28:B32) - currently one
   editable global stress % applied to lines marked Floating = YES.
3. Confirm current SBR value (default 2.75%) and ceiling rate (default 10%).

## Known scope notes (per the master build command)

- No login/registration - phase 2.
- HF joint-applicant (Applicant A + B Summary) is a fast-follow; v1 is
  single-applicant (flagged in the HF panel).
- HF Business Income / SIP legacy sub-calculators from V10: Bizman income is
  covered by the shared income module; SIP not yet ported.
- Experian PDF extraction is positional/heuristic - always review the parsed
  rows (they stay fully editable; a debug trail prints to the browser console).
- Persistence = Export/Import JSON only (drop a saved .json onto the Experian
  zone to reload a session). Print/Export PDF uses the browser's print dialog.
