-- ============================================================================
--  ARBM DSR Calculator - REPORT DATA  (SQLite)
--  schema_version: 3
--
--  TWO KEYS, EVERY TABLE
--    id   unique per ROW. Apply for PF twice and you get two rows, two ids.
--    cic  the CUSTOMER key (their IC, digits only). The SAME value in every
--         table, so one person's PF, HF, CC, CCRIS lines and income all join
--         on cic without guessing:
--
--           SELECT * FROM loan_application WHERE cic = '010101010001';
--
--  Foreign keys (report_id, case_id, application_id, ...) still link a row to
--  its exact parent; cic links everything about one human being.
--
--  CONVENTIONS
--    money    NUMERIC, RM, 2 dp          dates  TEXT 'YYYY-MM-DD'
--    percent  NUMERIC as a percent (85.48 = 85.48%), except columns ending
--             _ratio which are 0-1 (a DSR of 65.43% is 0.6543)
--    boolean  INTEGER 0/1
--    data_source  EXPERIAN (off the PDF) | MANUAL (typed) | DERIVED
--                 (recomputed by the exporter from the detail rows)
-- ============================================================================

PRAGMA foreign_keys = ON;


-- ============================================================================
--  SUBJECT AND REPORT
-- ============================================================================

-- One row per person. cic is unique HERE and repeated everywhere else.
CREATE TABLE IF NOT EXISTS customer (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL UNIQUE,   -- IC, digits only
  ic_formatted     TEXT,                      -- 010101-01-0001
  old_ic_pp_no     TEXT,
  full_name        TEXT    NOT NULL,
  nationality      TEXT,
  birth_date       TEXT,                      -- derived from the IC
  age_years        INTEGER,
  gender           TEXT CHECK (gender IN ('M','F')),
  birth_state_code TEXT,
  customer_type    TEXT CHECK (customer_type IN ('NORMAL','BIZMAN')),
  customer_class   TEXT CHECK (customer_class IN ('TYPE A','TYPE B')),
  segment          TEXT,
  first_seen_at    TEXT,
  last_seen_at     TEXT
);

-- One credit report = one Experian/CTOS pull (or one manual intake).
CREATE TABLE IF NOT EXISTS credit_report (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  case_id          INTEGER,
  your_ref_no      TEXT,
  report_date      TEXT,
  bureau           TEXT DEFAULT 'EXPERIAN',
  data_source      TEXT NOT NULL DEFAULT 'EXPERIAN',
  imported_by      TEXT,
  imported_at      TEXT,
  schema_version   INTEGER NOT NULL DEFAULT 3
);

-- CREDIT SCORE panel: i-SCORE, risk grade 1-10, band.
CREATE TABLE IF NOT EXISTS report_credit_score (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  report_id        INTEGER NOT NULL UNIQUE REFERENCES credit_report(id) ON DELETE CASCADE,
  iscore           INTEGER,
  risk_grade       INTEGER CHECK (risk_grade BETWEEN 1 AND 10),
  risk_band        TEXT CHECK (risk_band IN ('WEAK','FAIR','GOOD','STRONG')),
  data_source      TEXT NOT NULL DEFAULT 'EXPERIAN'
);

-- "Key Contributing Factors (Why the Score is not Higher)" - one row per bullet.
CREATE TABLE IF NOT EXISTS report_score_factor (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  report_id        INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  seq              INTEGER,
  factor_text      TEXT
);


-- ============================================================================
--  REPORT SUMMARY PANELS
-- ============================================================================

-- SUMMARY CREDIT INFORMATION: "By Banking Info" + "By Experian", one row.
CREATE TABLE IF NOT EXISTS report_summary_credit_info (
  id                        INTEGER PRIMARY KEY,
  cic                       TEXT    NOT NULL,
  report_id                 INTEGER NOT NULL UNIQUE REFERENCES credit_report(id) ON DELETE CASCADE,
  apps_approved_12m         INTEGER,
  apps_pending              INTEGER,
  special_attention_count   INTEGER,
  legal_action_count        INTEGER,
  existing_facility_count   INTEGER,
  bankruptcy_record_count   INTEGER,
  legal_suit_count          INTEGER,
  trade_reference_count     INTEGER,
  enquiries_12m             INTEGER,
  company_interest_count    INTEGER,
  data_source               TEXT NOT NULL DEFAULT 'EXPERIAN'
);

-- "Total no. of Credit Applications" - one row per bucket.
CREATE TABLE IF NOT EXISTS report_application_summary (
  id                 INTEGER PRIMARY KEY,
  cic                TEXT    NOT NULL,
  report_id          INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  bucket             TEXT    NOT NULL CHECK (bucket IN ('APPROVED_12M','PENDING','REJECTED')),
  application_count  INTEGER,
  total_amount       NUMERIC,
  data_source        TEXT NOT NULL DEFAULT 'EXPERIAN',
  UNIQUE (report_id, bucket)
);

-- SUMMARY OF POTENTIAL & CURRENT LIABILITIES - one row per capacity.
CREATE TABLE IF NOT EXISTS report_liability_summary (
  id                        INTEGER PRIMARY KEY,
  cic                       TEXT    NOT NULL,
  report_id                 INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  capacity                  TEXT    NOT NULL,  -- BORROWER | GUARANTOR | DIRECTOR
  outstanding_amount        NUMERIC,
  total_limit               NUMERIC,
  fec_limit                 NUMERIC,
  legal_action_taken        INTEGER CHECK (legal_action_taken IN (0,1)),
  special_attention_account INTEGER CHECK (special_attention_account IN (0,1)),
  data_source               TEXT NOT NULL DEFAULT 'EXPERIAN',
  UNIQUE (report_id, capacity)
);

-- Secured vs unsecured aggregates.
CREATE TABLE IF NOT EXISTS report_facility_summary (
  id                       INTEGER PRIMARY KEY,
  cic                      TEXT    NOT NULL,
  report_id                INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  segment                  TEXT    NOT NULL CHECK (segment IN ('SECURED','UNSECURED')),
  facility_count           INTEGER,
  total_outstanding        NUMERIC,
  total_limit              NUMERIC,
  outstanding_vs_limit_pct NUMERIC,           -- NULL when a line has no limit
  highest_arrears_12m      INTEGER,
  data_source              TEXT NOT NULL DEFAULT 'EXPERIAN',
  UNIQUE (report_id, segment)
);

-- "Earliest Approved Facilites" / "Latest 3 Approved Facilites".
CREATE TABLE IF NOT EXISTS report_facility_milestone (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  report_id        INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  kind             TEXT CHECK (kind IN ('EARLIEST','LATEST')),
  seq              INTEGER,
  facility_type    TEXT,
  approved_date    TEXT,
  data_source      TEXT NOT NULL DEFAULT 'EXPERIAN'
);

-- Utilisation / lender mix.
CREATE TABLE IF NOT EXISTS report_utilisation (
  id                           INTEGER PRIMARY KEY,
  cic                          TEXT    NOT NULL,
  report_id                    INTEGER NOT NULL UNIQUE REFERENCES credit_report(id) ON DELETE CASCADE,
  credit_card_avg_util_6m_pct  NUMERIC,
  other_revolving_avg_util_pct NUMERIC,
  charge_card_min_util_12m     NUMERIC,
  charge_card_max_util_12m     NUMERIC,
  nhef_account_count           INTEGER,
  local_lender_account_count   INTEGER,
  foreign_lender_account_count INTEGER,
  data_source                  TEXT NOT NULL DEFAULT 'EXPERIAN'
);

-- SHAREHOLDING INTEREST / directorships (a BIZMAN case lives on this).
CREATE TABLE IF NOT EXISTS report_shareholding (
  id                   INTEGER PRIMARY KEY,
  cic                  TEXT    NOT NULL,
  report_id            INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  seq                  INTEGER,
  company_name         TEXT,
  company_reg_no       TEXT,
  incorporation_date   TEXT,
  paidup_capital       NUMERIC,
  business_activity    TEXT,
  position             TEXT,
  appointed_date       TEXT,
  business_expiry_date TEXT,
  shareholding_amount  NUMERIC,
  shareholding_pct     NUMERIC,
  remark               TEXT,
  last_updated_date    TEXT,
  data_source          TEXT NOT NULL DEFAULT 'EXPERIAN'
);

CREATE TABLE IF NOT EXISTS report_address (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  report_id        INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  seq              INTEGER,
  address_type     TEXT,                      -- RESIDENTIAL | EMPLOYMENT | MAILING
  address_line     TEXT,
  postcode         TEXT,
  city             TEXT,
  state            TEXT,
  reported_date    TEXT,
  data_source      TEXT NOT NULL DEFAULT 'EXPERIAN'
);

CREATE TABLE IF NOT EXISTS report_employment (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  report_id        INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  seq              INTEGER,
  employer_name    TEXT,
  occupation       TEXT,
  reported_date    TEXT,
  data_source      TEXT NOT NULL DEFAULT 'EXPERIAN'
);


-- ============================================================================
--  DETAILED CREDIT REPORT (BANKING ACCOUNTS) = CCRIS, and NLCI
--
--  The PDF prints each item as a PARENT row (No | Date | Capacity | Lender |
--  Collateral | LIMIT) followed by one or more FACILITY sub-rows. That two
--  level shape is kept: ccris_account is the parent, ccris_facility the
--  sub-rows. Sub-rows are never summed on import - one printed line, one row.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ccris_account (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  report_id        INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  item_no          INTEGER,                   -- the "No" column
  approval_date    TEXT,
  capacity         TEXT CHECK (capacity IN ('OWN','JOINT','GUARANTOR','DIRECTOR')),
  lender_name      TEXT,
  lender_type      TEXT,
  collateral_type  TEXT,                      -- CLEAN | PROPERTIES | MOTOR V (JPJ) ...
  account_status   TEXT,
  total_limit      NUMERIC,
  data_source      TEXT NOT NULL DEFAULT 'EXPERIAN'
);

-- One row per printed facility line. monthly_commitment is what the
-- calculator charged for this line, so the arithmetic is auditable here.
CREATE TABLE IF NOT EXISTS ccris_facility (
  id                     INTEGER PRIMARY KEY,
  cic                    TEXT    NOT NULL,
  account_id             INTEGER NOT NULL REFERENCES ccris_account(id) ON DELETE CASCADE,
  report_id              INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  line_no                INTEGER,
  facility_code          TEXT,                -- CRDTCARD | HSLNFNCE | PCPASCAR ...
  facility_desc          TEXT,
  outstanding_amount     NUMERIC,
  limit_amount           NUMERIC,             -- only on the item's FIRST line
  instalment_amount      NUMERIC,
  utilisation_pct        NUMERIC,
  legal_status           TEXT,
  is_floating            INTEGER CHECK (is_floating IN (0,1)),
  is_unsecured           INTEGER CHECK (is_unsecured IN (0,1)),
  arrears_months_max_12m INTEGER,
  monthly_commitment     NUMERIC,             -- as charged by the calculator
  commitment_override    NUMERIC,
  stress_commitment      NUMERIC,
  source_section         TEXT CHECK (source_section IN ('CCRIS','NLCI','USER_ADDED')),
  data_source            TEXT NOT NULL DEFAULT 'EXPERIAN'
);

-- The 12-month conduct grid (0 = paid on time, 1..6 = months in arrears).
CREATE TABLE IF NOT EXISTS ccris_conduct (
  id                 INTEGER PRIMARY KEY,
  cic                TEXT    NOT NULL,
  facility_id        INTEGER NOT NULL REFERENCES ccris_facility(id) ON DELETE CASCADE,
  report_id          INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  month_seq          INTEGER,                 -- 1 = most recent
  month_label        TEXT,
  arrears_months     INTEGER,
  outstanding_amount NUMERIC,
  data_source        TEXT NOT NULL DEFAULT 'EXPERIAN'
);

-- SPECIAL ATTENTION ACCOUNT (rescheduled / restructured / under watch).
CREATE TABLE IF NOT EXISTS ccris_special_attention (
  id                 INTEGER PRIMARY KEY,
  cic                TEXT    NOT NULL,
  report_id          INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  item_no            INTEGER,
  approval_date      TEXT,
  capacity           TEXT,
  lender_name        TEXT,
  facility_code      TEXT,
  status             TEXT,
  outstanding_amount NUMERIC,
  limit_amount       NUMERIC,
  instalment_amount  NUMERIC,
  arrears_months     INTEGER,
  remark             TEXT,
  data_source        TEXT NOT NULL DEFAULT 'EXPERIAN'
);

-- CREDIT APPLICATION section: applied for in the last 12 months + status.
-- A pending application is an unbooked future commitment.
CREATE TABLE IF NOT EXISTS ccris_credit_application (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  report_id        INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  item_no          INTEGER,
  application_date TEXT,
  capacity         TEXT,
  lender_name      TEXT,
  facility_code    TEXT,
  amount_applied   NUMERIC,
  status           TEXT,                      -- APPROVED | PENDING | REJECTED
  data_source      TEXT NOT NULL DEFAULT 'EXPERIAN'
);

-- NON-BANK LENDER CREDIT INFORMATION (NLCI): co-ops, MBSB-type lenders, BNPL.
-- Kept separate so "bank exposure" and "total exposure" are both answerable.
CREATE TABLE IF NOT EXISTS nlci_account (
  id                     INTEGER PRIMARY KEY,
  cic                    TEXT    NOT NULL,
  report_id              INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  item_no                INTEGER,
  approval_date          TEXT,
  capacity               TEXT,
  lender_name            TEXT,
  lender_type            TEXT,
  facility_code          TEXT,
  collateral_type        TEXT,
  limit_amount           NUMERIC,
  instalment_amount      NUMERIC,
  outstanding_amount     NUMERIC,
  tenure_months          INTEGER,
  legal_status           TEXT,
  arrears_months_max_12m INTEGER,
  monthly_commitment     NUMERIC,
  last_updated_date      TEXT,
  data_source            TEXT NOT NULL DEFAULT 'EXPERIAN'
);


-- ============================================================================
--  LEGAL, BANKRUPTCY, TRADE REFERENCE, ENQUIRIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_suit (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  report_id        INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  subject_role     TEXT CHECK (subject_role IN ('DEFENDANT','PLAINTIFF')),
  case_no          TEXT,
  court            TEXT,
  filed_date       TEXT,
  plaintiff_name   TEXT,
  defendant_name   TEXT,
  claim_amount     NUMERIC,
  status           TEXT,
  remark           TEXT,
  data_source      TEXT NOT NULL DEFAULT 'EXPERIAN'
);

CREATE TABLE IF NOT EXISTS bankruptcy_action (
  id                INTEGER PRIMARY KEY,
  cic               TEXT    NOT NULL,
  report_id         INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  case_no           TEXT,
  court             TEXT,
  petitioner_name   TEXT,
  petition_date     TEXT,
  adjudication_date TEXT,
  amount            NUMERIC,
  status            TEXT,
  data_source       TEXT NOT NULL DEFAULT 'EXPERIAN'
);

CREATE TABLE IF NOT EXISTS trade_reference (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  report_id        INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  subscriber_name  TEXT,
  reported_date    TEXT,
  amount           NUMERIC,
  status           TEXT,
  remark           TEXT,
  data_source      TEXT NOT NULL DEFAULT 'EXPERIAN'
);

-- "Total Enquiries for Last 12 months" detail. A burst of enquiries just
-- before an application is a standard credit-hungry signal.
CREATE TABLE IF NOT EXISTS credit_enquiry (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  report_id        INTEGER NOT NULL REFERENCES credit_report(id) ON DELETE CASCADE,
  enquiry_date     TEXT,
  enquirer_name    TEXT,
  enquiry_purpose  TEXT,
  data_source      TEXT NOT NULL DEFAULT 'EXPERIAN'
);


-- ============================================================================
--  THE CASE (what the officer did with the report)
-- ============================================================================

CREATE TABLE IF NOT EXISTS dsr_case (
  id                 INTEGER PRIMARY KEY,
  cic                TEXT    NOT NULL,
  reference          TEXT UNIQUE,             -- DSR-2026-000123
  report_id          INTEGER REFERENCES credit_report(id) ON DELETE SET NULL,
  mode               TEXT,                    -- pf | hf | cc | pf-cc | hf-cc | pf-hf
  status             TEXT CHECK (status IN ('draft','pending_checker','returned','approved','rejected')),
  maker_username     TEXT,
  maker_name         TEXT,
  checker_username   TEXT,
  checker_name       TEXT,
  gross_income       NUMERIC,
  net_income         NUMERIC,
  total_commitment   NUMERIC,                 -- L55, before settlements
  bt_total           NUMERIC,                 -- L56, balance transfers + settlements
  grand_total        NUMERIC,                 -- L57 = L55 - L56
  unsecured_total    NUMERIC,
  stress_total       NUMERIC,
  verdict            TEXT,
  dsr_ratio          NUMERIC,
  ndi_amount         NUMERIC,
  edit_count         INTEGER,
  return_count       INTEGER,                 -- times the checker sent it back
  submitted_at       TEXT,                    -- last (re)submission to the checker
  returned_at        TEXT,
  return_notes       TEXT,                    -- latest return reason
  decided_at         TEXT,
  decision_notes     TEXT,
  created_at         TEXT,
  updated_at         TEXT
);

-- The maker/checker exchange on a case: every return, resubmission and final
-- decision, in order. `seq` is 1-based within a case, so ORDER BY case_id, seq
-- replays the conversation exactly as the sign-off panel shows it.
CREATE TABLE IF NOT EXISTS dsr_case_comment (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  case_id          INTEGER NOT NULL REFERENCES dsr_case(id) ON DELETE CASCADE,
  seq              INTEGER NOT NULL,
  comment_type     TEXT CHECK (comment_type IN ('RETURNED','RESUBMITTED','APPROVED','REJECTED')),
  author_name      TEXT,
  author_role      TEXT,
  comment_text     TEXT,
  commented_at     TEXT
);

-- Recognised income per applicant (MAIN, or joint applicant A / B on an HF).
CREATE TABLE IF NOT EXISTS case_income (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  case_id          INTEGER NOT NULL REFERENCES dsr_case(id) ON DELETE CASCADE,
  applicant_key    TEXT CHECK (applicant_key IN ('MAIN','A','B')),
  applicant_name   TEXT,
  applicant_ic     TEXT,
  applicant_iscore INTEGER,
  customer_type    TEXT CHECK (customer_type IN ('NORMAL','BIZMAN')),
  income_mode      TEXT CHECK (income_mode IN ('MANUAL','EPF','BIZMAN')),
  gross_income     NUMERIC,
  net_income       NUMERIC,
  epf_rate_pct     NUMERIC,
  deduction_epf    NUMERIC,
  deduction_pcb    NUMERIC,
  deduction_socso  NUMERIC,
  deduction_other  NUMERIC,
  profit_margin_pct NUMERIC,                  -- BIZMAN only
  shareholding_pct  NUMERIC,
  avg_itr_annual    NUMERIC,
  tax_deduction     NUMERIC,
  UNIQUE (case_id, applicant_key)
);

-- The 6 salary months (or 12 business months) behind that income.
CREATE TABLE IF NOT EXISTS case_income_month (
  id                   INTEGER PRIMARY KEY,
  cic                  TEXT    NOT NULL,
  income_id            INTEGER NOT NULL REFERENCES case_income(id) ON DELETE CASCADE,
  month_seq            INTEGER,
  month_label          TEXT,
  stream               TEXT CHECK (stream IN ('SALARY','EPF','BUSINESS')),
  basic                NUMERIC,
  fixed_allowance      NUMERIC,
  fixed_allowance_desc TEXT,
  other_allowance      NUMERIC,
  commission           NUMERIC,
  overtime             NUMERIC,
  epf_employee         NUMERIC,
  epf_deduction        NUMERIC,
  pcb                  NUMERIC,
  socso                NUMERIC,
  bank1_credit         NUMERIC,               -- BIZMAN: total credit, bank 1
  bank2_credit         NUMERIC
);

-- Balance transfers / settlements credited against the DSR.
CREATE TABLE IF NOT EXISTS case_balance_transfer (
  id                 INTEGER PRIMARY KEY,
  cic                TEXT    NOT NULL,
  case_id            INTEGER NOT NULL REFERENCES dsr_case(id) ON DELETE CASCADE,
  applicant_key      TEXT CHECK (applicant_key IN ('MAIN','A','B')),
  bt_type            TEXT CHECK (bt_type IN ('BT','SETTLE')),
  facility_code      TEXT,
  outstanding_amount NUMERIC,
  monthly_repayment  NUMERIC
);


-- ============================================================================
--  PRODUCT APPLICATIONS
--
--  loan_application is the common header; the three product tables carry what
--  is specific to that product. Apply for PF twice and that is two rows with
--  two ids and the same cic.
-- ============================================================================

CREATE TABLE IF NOT EXISTS loan_application (
  id                  INTEGER PRIMARY KEY,
  cic                 TEXT    NOT NULL,
  case_id             INTEGER NOT NULL REFERENCES dsr_case(id) ON DELETE CASCADE,
  report_id           INTEGER REFERENCES credit_report(id) ON DELETE SET NULL,
  product_code        TEXT CHECK (product_code IN ('PF','HF','CC')),
  applicant_key       TEXT CHECK (applicant_key IN ('MAIN','A','B')),
  applicant_name      TEXT,
  gross_income        NUMERIC,                -- income THIS product was scored on
  net_income          NUMERIC,
  existing_commitment NUMERIC,
  new_instalment      NUMERIC,
  new_commitment      NUMERIC,
  dsr_ratio           NUMERIC,
  dsr_threshold_ratio NUMERIC,
  ndi_amount          NUMERIC,
  verdict             TEXT,
  is_approved         INTEGER CHECK (is_approved IN (0,1)),
  created_at          TEXT
);

CREATE TABLE IF NOT EXISTS personal_loan_application (
  id                  INTEGER PRIMARY KEY,
  cic                 TEXT    NOT NULL,
  application_id      INTEGER NOT NULL UNIQUE REFERENCES loan_application(id) ON DELETE CASCADE,
  financing_amount    NUMERIC,
  tenure_months       INTEGER,
  pf_product          TEXT,                   -- OTHERS | MICRO 1 | MICRO 2
  risk_grade          INTEGER,
  flat_rate_pct       NUMERIC,
  epr_rate_pct        NUMERIC,
  deviation_rate_pct  NUMERIC,
  rate_used_pct       NUMERIC,
  monthly_instalment  NUMERIC,
  eligibility_gate    TEXT,                   -- OK | EXCEED LIMIT | NOT ELIGIBLE
  ndi_minimum         NUMERIC,
  dsr_current_ratio   NUMERIC,
  dsr_before_bt_ratio NUMERIC,
  unsecured_commitment NUMERIC,
  unsecured_dsr_ratio NUMERIC,
  unsecured_cap_ratio NUMERIC,
  stress_commitment   NUMERIC,
  stress_dsr_ratio    NUMERIC,
  stress_ndi          NUMERIC,
  stress_verdict      TEXT
);

-- Home One Account runs two parallel terms, so per-term numbers live in
-- home_loan_term; a plain HOME FINANCING case has exactly one term row.
CREATE TABLE IF NOT EXISTS home_loan_application (
  id                      INTEGER PRIMARY KEY,
  cic                     TEXT    NOT NULL,
  application_id          INTEGER NOT NULL UNIQUE REFERENCES loan_application(id) ON DELETE CASCADE,
  hf_product              TEXT CHECK (hf_product IN ('HOME FINANCING','HOME ONE ACCOUNT')),
  property_value          NUMERIC,
  total_financing         NUMERIC,
  total_fec               NUMERIC,            -- valuation + legal
  margin_of_financing_pct NUMERIC,
  monthly_instalment      NUMERIC,
  ctf_instalment          NUMERIC,
  instalment_full_tenure  NUMERIC,
  applicant_count         INTEGER,            -- 1 = single, 2/3 = joint
  hf_customer_class       TEXT CHECK (hf_customer_class IN ('TYPE A','TYPE B'))
);

CREATE TABLE IF NOT EXISTS home_loan_term (
  id                 INTEGER PRIMARY KEY,
  cic                TEXT    NOT NULL,
  home_loan_id       INTEGER NOT NULL REFERENCES home_loan_application(id) ON DELETE CASCADE,
  application_id     INTEGER REFERENCES loan_application(id) ON DELETE CASCADE,
  term_no            INTEGER CHECK (term_no IN (1,2)),
  financing_amount   NUMERIC,
  renovation_amount  NUMERIC,
  mrtt_contribution  NUMERIC,
  valuation_cost     NUMERIC,
  legal_cost         NUMERIC,
  fec                NUMERIC,
  total_financing    NUMERIC,
  tenure_years       NUMERIC,
  sbr_pct            NUMERIC,
  spread_pct         NUMERIC,
  effective_rate_pct NUMERIC,
  monthly_instalment NUMERIC,
  UNIQUE (home_loan_id, term_no)
);

CREATE TABLE IF NOT EXISTS credit_card_application (
  id                   INTEGER PRIMARY KEY,
  cic                  TEXT    NOT NULL,
  application_id       INTEGER NOT NULL UNIQUE REFERENCES loan_application(id) ON DELETE CASCADE,
  card_product         TEXT,                  -- VISA_PLATINUM | VISA_SIGNATURE | BOTH
  income_multiplier    NUMERIC,
  max_eligible_limit   NUMERIC,
  proposed_limit       NUMERIC,
  approved_limit       NUMERIC,
  is_eligible_by_limit INTEGER CHECK (is_eligible_by_limit IN (0,1)),
  monthly_instalment   NUMERIC,               -- the DSR charge on the limit
  dsr_threshold_pct    NUMERIC,
  dsr_after_bt_ratio   NUMERIC,
  dsr_before_bt_ratio  NUMERIC
);


-- ============================================================================
--  COMBOS (PF+CC, HF+CC, PF+HF)
--
--  PF+CC   SINGLE POT: both instalments on the main applicant's income, and
--          the governing threshold is the TIGHTER of the two. One row.
--  HF+CC   PER APPLICANT: the home instalment is split evenly, then each
--  PF+HF   person is scored on THEIR income, THEIR L57 and THEIR own second
--          product. One row per applicant - hence applicant_key on those two.
-- ============================================================================

CREATE TABLE IF NOT EXISTS combo_application (
  id               INTEGER PRIMARY KEY,
  cic              TEXT    NOT NULL,
  case_id          INTEGER NOT NULL REFERENCES dsr_case(id) ON DELETE CASCADE,
  report_id        INTEGER REFERENCES credit_report(id) ON DELETE SET NULL,
  combo_type       TEXT CHECK (combo_type IN ('PF_CC','HF_CC','PF_HF')),
  scoring_basis    TEXT CHECK (scoring_basis IN ('SINGLE_POT','PER_APPLICANT')),
  applicant_count  INTEGER,
  verdict          TEXT,
  is_approved      INTEGER CHECK (is_approved IN (0,1)),
  created_at       TEXT,
  UNIQUE (case_id, combo_type)
);

CREATE TABLE IF NOT EXISTS combo_pf_cc (
  id                        INTEGER PRIMARY KEY,
  cic                       TEXT    NOT NULL,
  combo_id                  INTEGER NOT NULL UNIQUE REFERENCES combo_application(id) ON DELETE CASCADE,
  case_id                   INTEGER NOT NULL REFERENCES dsr_case(id) ON DELETE CASCADE,
  pf_application_id         INTEGER REFERENCES loan_application(id) ON DELETE SET NULL,
  cc_application_id         INTEGER REFERENCES loan_application(id) ON DELETE SET NULL,
  pf_instalment             NUMERIC,
  cc_instalment             NUMERIC,
  existing_commitment       NUMERIC,
  new_commitment            NUMERIC,
  gross_income              NUMERIC,
  net_income                NUMERIC,
  dsr_ratio                 NUMERIC,
  pf_threshold_ratio        NUMERIC,
  cc_threshold_ratio        NUMERIC,
  governing_threshold_ratio NUMERIC,
  ndi_amount                NUMERIC,
  verdict                   TEXT,
  is_approved               INTEGER CHECK (is_approved IN (0,1))
);

CREATE TABLE IF NOT EXISTS combo_hf_cc (
  id                    INTEGER PRIMARY KEY,
  cic                   TEXT    NOT NULL,
  combo_id              INTEGER NOT NULL REFERENCES combo_application(id) ON DELETE CASCADE,
  case_id               INTEGER NOT NULL REFERENCES dsr_case(id) ON DELETE CASCADE,
  applicant_key         TEXT CHECK (applicant_key IN ('MAIN','A','B')),
  applicant_name        TEXT,
  applicant_type        TEXT CHECK (applicant_type IN ('NORMAL','BIZMAN')),
  applicant_iscore      INTEGER,
  hf_application_id     INTEGER REFERENCES loan_application(id) ON DELETE SET NULL,
  cc_application_id     INTEGER REFERENCES loan_application(id) ON DELETE SET NULL,
  hf_instalment_total   NUMERIC,
  applicant_count       INTEGER,
  hf_instalment_share   NUMERIC,
  cc_instalment         NUMERIC,
  existing_commitment   NUMERIC,              -- THIS applicant's L57
  new_commitment        NUMERIC,
  personal_gross_income NUMERIC,              -- never the combined pot
  personal_net_income   NUMERIC,
  dsr_ratio             NUMERIC,
  dsr_threshold_ratio   NUMERIC,
  ndi_amount            NUMERIC,
  is_approved           INTEGER CHECK (is_approved IN (0,1)),
  UNIQUE (combo_id, applicant_key)
);

CREATE TABLE IF NOT EXISTS combo_pf_hf (
  id                    INTEGER PRIMARY KEY,
  cic                   TEXT    NOT NULL,
  combo_id              INTEGER NOT NULL REFERENCES combo_application(id) ON DELETE CASCADE,
  case_id               INTEGER NOT NULL REFERENCES dsr_case(id) ON DELETE CASCADE,
  applicant_key         TEXT CHECK (applicant_key IN ('MAIN','A','B')),
  applicant_name        TEXT,
  applicant_type        TEXT CHECK (applicant_type IN ('NORMAL','BIZMAN')),
  applicant_iscore      INTEGER,
  hf_application_id     INTEGER REFERENCES loan_application(id) ON DELETE SET NULL,
  pf_application_id     INTEGER REFERENCES loan_application(id) ON DELETE SET NULL,
  hf_instalment_total   NUMERIC,
  applicant_count       INTEGER,
  hf_instalment_share   NUMERIC,
  pf_instalment         NUMERIC,
  existing_commitment   NUMERIC,
  new_commitment        NUMERIC,
  personal_gross_income NUMERIC,
  personal_net_income   NUMERIC,
  dsr_ratio             NUMERIC,
  dsr_threshold_ratio   NUMERIC,
  ndi_amount            NUMERIC,
  is_approved           INTEGER CHECK (is_approved IN (0,1)),
  UNIQUE (combo_id, applicant_key)
);


-- ============================================================================
--  INDEXES - cic first, because that is how a customer is looked up
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_report_cic          ON credit_report(cic);
CREATE INDEX IF NOT EXISTS idx_score_cic           ON report_credit_score(cic);
CREATE INDEX IF NOT EXISTS idx_account_cic         ON ccris_account(cic);
CREATE INDEX IF NOT EXISTS idx_facility_cic        ON ccris_facility(cic);
CREATE INDEX IF NOT EXISTS idx_nlci_cic            ON nlci_account(cic);
CREATE INDEX IF NOT EXISTS idx_case_cic            ON dsr_case(cic);
CREATE INDEX IF NOT EXISTS idx_income_cic          ON case_income(cic);
CREATE INDEX IF NOT EXISTS idx_application_cic     ON loan_application(cic);
CREATE INDEX IF NOT EXISTS idx_combo_cic           ON combo_application(cic);
CREATE INDEX IF NOT EXISTS idx_facility_account    ON ccris_facility(account_id);
CREATE INDEX IF NOT EXISTS idx_facility_code       ON ccris_facility(facility_code);
CREATE INDEX IF NOT EXISTS idx_application_case    ON loan_application(case_id);
CREATE INDEX IF NOT EXISTS idx_application_product ON loan_application(product_code);
CREATE INDEX IF NOT EXISTS idx_case_status         ON dsr_case(status);
CREATE INDEX IF NOT EXISTS idx_comment_case        ON dsr_case_comment(case_id);
CREATE INDEX IF NOT EXISTS idx_comment_cic         ON dsr_case_comment(cic);
CREATE INDEX IF NOT EXISTS idx_incomemonth_income  ON case_income_month(income_id);


-- ============================================================================
--  COMPLETENESS
--
--  Populated from the PDF today: subject, i-SCORE, every CCRIS banking line,
--  every NLCI line - plus the case, income and applications.
--
--  Summary panels carry data_source = 'DERIVED': the exporter recomputes them
--  from the detail lines instead of leaving them empty. They become
--  'EXPERIAN' the day pdfExtractor.js reads those boxes directly.
--
--  Empty by design (no extractor yet, defined so filling them needs no
--  migration): report_score_factor, report_shareholding, report_address,
--  report_employment, report_facility_milestone, report_application_summary,
--  ccris_conduct, ccris_special_attention, ccris_credit_application,
--  legal_suit, bankruptcy_action, trade_reference, credit_enquiry.
-- ============================================================================
