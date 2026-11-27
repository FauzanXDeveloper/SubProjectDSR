# DSR Calculator (standalone)

Calculator only: no maker/checker, no admin, no server, nothing stored in the browser.

## Use

Double-click `index.html`. Sign in with a user from `data/users.js`.

Before the first run, copy the template and edit it (the real file is **not**
committed, because this repository is public and it holds working passwords):

```
copy data\users.example.js data\users.js
```

If the file is missing the login screen says so and sign-in stays disabled.

- **Export case (JSON)** saves the current case to a `.json` file you can send to a colleague.
- **Import case (JSON)** loads a case file back in.
- **Print / Export PDF** prints the evaluation report (choose "Save as PDF" in the print dialog).
- Closing or refreshing the page signs you out and clears the case. Export first if you want to keep it.

### Payslip import

Text-based PDFs are parsed locally into the editable six-month salary grid. The parser
uses label + table position (not just the first number on a row), ignores employer/YTD
figures, maps EIS into **SOCSO + EIS**, and puts other employee deductions into
**Other Deductions**. It checks the itemized deductions and calculated net against the
printed payslip totals; a mismatch is shown for review. A file with no embedded PDF text
(a scan/photo) cannot be OCR-read in this double-click/file-only build, so key it in
manually.

EPF/KWSP PDFs are identified from their document text (KWSP/EPF plus contribution
headings), not just the filename, so a generic filename such as `annual-statement.pdf`
can still route to the EPF statement reader.

Common English/Malay labels are normalized, while unfamiliar amounts in the detected
earnings or deductions column go to Other Income or Other deductions. Detected employee
name/IC is checked against the applicant. Extracted amounts remain editable. Other
deductions are subtracted from recognized net income; if blank, prior calculations are
unchanged.

For the sample payroll layout, the parser must select the actual salary amount (not a
nearby rate), map employee EPF and SOCSO/EIS, and put an unrecognised employee deduction
such as SKBBK into Other deductions. It must not count the repeated statutory/YTD table
again. The test fixture uses synthetic amounts; customer payslips are not stored in tests.

Payslip parser regression fixtures (from the project root): `node tests/payslip-tests.js`.

## Layout

```
index.html              the page (login, sidebar, shared intake, product panels)
data/users.js           hard-coded users (username, password, name, staffId)
data/ndiPricing.js      NDI pricing table
js/products.js          THE PRODUCT LIST - one line per product folder
products/pf/pf.js       Personal Financing  (formulas + screen)
products/hf/hf.js       Home Financing      (formulas + screen)
products/cc/cc.js       Credit Card         (formulas + screen)
js/core/                shared: intake, state, report, decision summary, app shell, login
js/engine/              calculation functions - copied unchanged from the original build
css/, public/, vendor/  styles, logos and card images, pdf.js
```

## Add or remove a product

- **Remove:** delete the product's folder under `products/` and delete its line in `js/products.js`. Combo modes that use it disappear automatically.
- **Add:** create `products/<id>/<id>.js` that calls `App.registerProduct({...})` (copy an existing product as a template), then add its path to `js/products.js`.

## Notes

- Passwords in `data/users.js` are plain text. Anyone who can open the folder can read them.
- Exported case files contain customer data (name, IC, CCRIS, income). Store and share them the way you would any customer document.

## Application form formats

Two templates reach the calculator:

- **Digital (2025 / vTB / Dec2025)** - a text PDF from the online application.
  Step A reads it directly: name, IC, employment, dependants, company postcode,
  financing amount and tenure.
- **ERG/08/2026** - usually a scan with no text layer. The browser cannot read
  it and Step A says so. Either key the fields in manually, or run the OCR
  helper and import the generated case file:

  ```
  pip install pymupdf rapidocr-onnxruntime
  python tools/ocr_appform.py --pdf "1.FORM.pdf" --out case.json
  ```

  Then use **Import case** in the calculator.

OCR reads the name, NRIC, dependants, company postcode/town/state, financing
amount and tenure. Tick boxes cannot be OCR-read, so Nature of Employment is
always selected manually. Town and state are taken from the postcode table
(`data/geo/myPostcodes.js`), which is also what decides the Urban / Sub-Urban
workplace bucket.
