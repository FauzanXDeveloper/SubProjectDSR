/* ============================================================
   reportSql.js - turns the browser's case database into a SQL
   dump for the REPORT DATA schema (web/sql/report_schema.sql).

   The calculator stores one JSON blob per case (store/db.js). That
   is the wrong shape for analysis, so this module flattens every
   stored case into normalised rows - customer, credit report, CCRIS
   accounts and facility lines, NLCI lines, income, and one
   application row per product - and emits them as INSERT statements
   an analyst can load with:

       sqlite3 report_data.db < dsr-report-data-<stamp>.sql

   Nothing here recomputes a verdict: the DSR / NDI / verdict columns
   are the figures the checker actually saw, read straight out of the
   stored snapshot. Only pure engine helpers are used, for the few
   per-line figures the snapshot does not carry (a CCRIS line's
   monthly commitment, a term's effective rate, the PF matrix rate) -
   so the numbers stay identical to the calculator's, and the export
   never needs the DOM.

   The summary panels (secured/unsecured aggregates, utilisation,
   liability totals) are DERIVED from the detail lines - the PDF
   extractor does not read those boxes yet. Every such row carries
   data_source = 'DERIVED' so nobody mistakes it for bureau data.
   ============================================================ */
(function () {
  'use strict';

  var SCHEMA_URL = '/sql/report_schema.sql';
  var SCHEMA_VERSION = 3;

  /* ---------------- SQL literal helpers ---------------- */

  /** SQL string literal, or NULL for empty. Doubles embedded quotes. */
  function q(v) {
    if (v === null || v === undefined) return 'NULL';
    var s = String(v).replace(/[\x00-\x1f\x7f]/g, ' ').trim();
    if (s === '') return 'NULL';
    return "'" + s.replace(/'/g, "''") + "'";
  }

  /** Numeric literal, or NULL. Tolerates "1,234.56" and "12%". */
  function n(v) {
    if (v === null || v === undefined || v === '') return 'NULL';
    var f = parseFloat(String(v).replace(/[,\s%]/g, ''));
    if (!isFinite(f)) return 'NULL';
    return String(Math.round(f * 1000000) / 1000000);
  }

  /** Money: same as n() but fixed to 2 dp so RM totals add up cleanly. */
  function m(v) {
    if (n(v) === 'NULL') return 'NULL';
    return String(Math.round(parseFloat(String(v).replace(/[,\s%]/g, '')) * 100) / 100);
  }

  function i(v) {
    if (n(v) === 'NULL') return 'NULL';
    return String(Math.round(parseFloat(String(v).replace(/[,\s]/g, ''))));
  }

  function b(v) {
    if (v === null || v === undefined || v === '') return 'NULL';
    return v ? '1' : '0';
  }

  /** Any of DD/MM/YYYY, YYYY-MM-DD, or an ISO timestamp -> 'YYYY-MM-DD'. */
  function dt(v) {
    if (!v) return 'NULL';
    var s = String(v).trim();
    var dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmy) return q(dmy[3] + '-' + dmy[2] + '-' + dmy[1]);
    var iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return q(iso[1]);
    return q(s);
  }

  /** Full timestamp, kept as stored (ISO-8601 UTC). */
  function ts(v) { return v ? q(String(v)) : 'NULL'; }

  function insert(table, cols, vals) {
    return 'INSERT INTO ' + table + ' (' + cols.join(', ') + ')\n  VALUES (' + vals.join(', ') + ');';
  }

  function num(v) {
    var f = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, ''));
    return isFinite(f) ? f : 0;
  }

  /* ---------------- IC-derived customer attributes ---------------- */

  function icDigits(ic) { return String(ic == null ? '' : ic).replace(/\D/g, ''); }

  /** Birth date from a 12-digit MyKad (YYMMDD-PB-###G), else null. */
  function birthDateFromIC(ic) {
    var d = icDigits(ic);
    if (d.length !== 12) return null;
    var yy = parseInt(d.slice(0, 2), 10);
    var mm = d.slice(2, 4), dd = d.slice(4, 6);
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null;
    var curYY = new Date().getFullYear() % 100;
    var year = (yy > curYY ? 1900 + yy : 2000 + yy);
    return year + '-' + mm + '-' + dd;
  }

  /** MyKad convention: the last digit is odd for male, even for female. */
  function genderFromIC(ic) {
    var d = icDigits(ic);
    if (d.length !== 12) return null;
    return (parseInt(d.slice(11), 10) % 2 === 1) ? 'M' : 'F';
  }

  function birthStateFromIC(ic) {
    var d = icDigits(ic);
    return d.length === 12 ? d.slice(6, 8) : null;
  }

  function ageFromIC(ic) {
    if (window.Engine && Engine.calculateAgeFromIC) return Engine.calculateAgeFromIC(ic);
    return null;
  }

  function formatIC(ic) {
    if (window.Engine && Engine.formatIC) return Engine.formatIC(ic);
    return ic || null;
  }

  /* ---------------- report-level derivations ---------------- */

  function riskGrade(iScore) {
    if (window.Engine && Engine.riskGradeFromIScore) return Engine.riskGradeFromIScore(iScore);
    return null;
  }

  /** Report legend: 1-4 WEAK, 5-6 FAIR, 7-8 GOOD, 9-10 STRONG. */
  function riskBand(grade) {
    if (grade == null) return null;
    if (grade <= 4) return 'WEAK';
    if (grade <= 6) return 'FAIR';
    if (grade <= 8) return 'GOOD';
    return 'STRONG';
  }

  /** Per-line monthly commitment exactly as the calculator charged it. */
  function lineCommitment(row, cardType, variant) {
    if (!(window.Engine && Engine.lineCommitment)) return null;
    try { return Engine.lineCommitment(row, cardType, variant).commitment; } catch (e) { return null; }
  }

  function stressOf(row, commitment) {
    if (commitment == null || !(window.Engine && Engine.stressCommitment)) return null;
    try {
      return Engine.stressCommitment(commitment,
        String(row.floating || '').toUpperCase() === 'YES', Engine.stressFactorFor(row));
    } catch (e) { return null; }
  }

  function isUnsecured(row) {
    if (!(window.Engine && Engine.isUnsecuredLine)) return null;
    try { return Engine.isUnsecuredLine(row) ? 1 : 0; } catch (e) { return null; }
  }

  /* ============================================================
     Applicant context - a home financing can be joint, and the two
     per-applicant combos (HF+CC, PF+HF) score each person on THEIR
     own income, THEIR own iScore and THEIR own existing
     commitments. These helpers rebuild exactly the inputs
     js/panels.js feeds the engine, using the same pure engine
     functions, so the exported combo rows are the figures the
     checker saw on screen - not a second opinion.
     ============================================================ */

  function emptyBizBlock() {
    return { months: [], profitMarginPct: '', shareholdingPct: 100, avgITRAnnual: '', taxDeduction: '' };
  }

  /** panels.js resolveApplicantIncome: exactly one stream survives per
      applicant, so payslip / EPF / business can never double-count. */
  function resolveIncome(type, mode, months, bizman, epf) {
    var isBiz = type === 'BIZMAN';
    var epfIncome = null;
    if (!isBiz && mode === 'EPF' && window.Engine && Engine.calcEPFIncome) {
      epfIncome = Engine.calcEPFIncome(
        ((epf && epf.months) || []).map(function (mo) { return mo.employee; }),
        epf && epf.epfRatePct, epf && epf.deductions);
    }
    return {
      months: (isBiz || mode === 'EPF') ? [] : (months || []),
      bizman: isBiz ? bizman : emptyBizBlock(),
      epfIncome: epfIncome
    };
  }

  function incomeParts(state, key) {
    if (key === 'MAIN') {
      var inc = state.income || {};
      return resolveIncome((state.customer || {}).type, inc.normalMode,
        inc.manualMonths, inc.bizman, inc.epf);
    }
    var a = (state.hfJoint || {})[key] || {};
    return resolveIncome(a.type, a.incomeMode, a.months, a.bizman, a.epf);
  }

  /** Main applicant first, then any ENABLED joint applicant. */
  function applicantList(state) {
    var list = [{ key: 'MAIN', name: (state.customer || {}).name || 'Main Applicant' }];
    ['A', 'B'].forEach(function (k) {
      var a = (state.hfJoint || {})[k];
      if (a && a.enabled) list.push({ key: k, name: a.name || ('Joint Applicant ' + k) });
    });
    return list;
  }

  function applicantType(state, key) {
    return key === 'MAIN' ? ((state.customer || {}).type || 'NORMAL')
      : (((state.hfJoint || {})[key] || {}).type || 'NORMAL');
  }

  function applicantIScore(state, key) {
    return key === 'MAIN' ? state.iScore : (((state.hfJoint || {})[key] || {}).iScore);
  }

  /** Personal (never combined) recognised income for one applicant. */
  function personalIncome(state, key) {
    if (!(window.Engine && Engine.calcHFIncomeMixed)) return { gross: 0, net: 0 };
    var inc = Engine.calcHFIncomeMixed([incomeParts(state, key)]);
    return { gross: inc.grossIncome || 0, net: inc.netIncome || 0 };
  }

  /** The HF Summary result for a case (per-applicant L55/L56/L57, the
      financing instalment, the combined income). Computed once per case. */
  function hfSummaryOf(state) {
    if (!(window.Engine && Engine.computeHFSummary)) return null;
    var applicants = applicantList(state).map(function (a) {
      var parts = incomeParts(state, a.key);
      var src = a.key === 'MAIN' ? state : ((state.hfJoint || {})[a.key] || {});
      return {
        key: a.key, label: a.name, ccris: src.ccris || [], bt: src.bt || [],
        months: parts.months, bizman: parts.bizman, epfIncome: parts.epfIncome
      };
    });
    var h = state.hf || {};
    try {
      return Engine.computeHFSummary({
        applicants: applicants, customerType: (state.customer || {}).type,
        product: h.product, hf: h, hoa: h.hoa, ctf: h.ctf
      });
    } catch (e) { return null; }
  }

  /* ============================================================
     Row builders. Each returns SQL text; ids are handed out by a
     single counter object so every table's PRIMARY KEY is stable
     within one dump.
     ============================================================ */

  function Ids() {
    var c = {};
    return function (table) { c[table] = (c[table] || 0) + 1; return c[table]; };
  }

  function emit(out, counts, table, sql) {
    out.push(sql);
    counts[table] = (counts[table] || 0) + 1;
  }

  /** Every row carries TWO keys: its own unique `id`, and `cic` - the customer
      key, identical in every table. Apply for PF twice and you get two ids and
      one cic, so a customer's whole file joins on cic without guessing. */
  function withKeys(id, cic, table, cols, vals) {
    return insert(table, ['id', 'cic'].concat(cols), [id, q(cic)].concat(vals));
  }

  /** CCRIS/USER_ADDED lines grouped back into their printed items. */
  function groupAccounts(rows) {
    var groups = [], byNo = {};
    (rows || []).forEach(function (r) {
      if (String(r.sourceSection || 'USER_ADDED') === 'NLCI') return;
      var key = (r.no === undefined || r.no === null || r.no === '') ? null : String(r.no);
      if (key === null || !byNo[key]) {
        var g = { no: r.no, date: r.date, capacity: r.capacity, collateral: r.collateral,
                  limit: 0, lines: [] };
        groups.push(g);
        if (key !== null) byNo[key] = g;
      }
      var grp = key === null ? groups[groups.length - 1] : byNo[key];
      // the shared item limit is printed on the first line only
      if (num(r.limit) > grp.limit) grp.limit = num(r.limit);
      grp.lines.push(r);
    });
    return groups;
  }

  /** Salary/EPF/business months for one applicant, as case_income_month rows. */
  function incomeMonths(inc, type, mode) {
    var rows = [];
    if (type === 'BIZMAN') {
      (inc.bizman && inc.bizman.months || []).forEach(function (mo, idx) {
        rows.push({ seq: idx + 1, label: null, stream: 'BUSINESS',
                    bank1: mo.bank1, bank2: mo.bank2 });
      });
      return rows;
    }
    if (mode === 'EPF') {
      ((inc.epf && inc.epf.months) || []).forEach(function (mo, idx) {
        rows.push({ seq: idx + 1, label: mo.label, stream: 'EPF', epfEmployee: mo.employee });
      });
      return rows;
    }
    (inc.manualMonths || inc.months || []).forEach(function (mo, idx) {
      rows.push({ seq: idx + 1, label: null, stream: 'SALARY',
                  basic: mo.basic, fixedAllowance: mo.fixedAllowance,
                  fixedAllowanceDesc: mo.fixedAllowanceDesc, other: mo.other,
                  commission: mo.commission, ot: mo.ot, epf: mo.epf,
                  pcb: mo.pcb, socso: mo.socso });
    });
    return rows;
  }

  /* ============================================================
     buildData - the whole dump body (INSERT statements only)
     ============================================================ */
  function buildData() {
    var db = Db.load();
    var out = [];
    var counts = {};
    var nextId = Ids();
    var customersByIC = {};   // ic -> customer_id
    var usersById = {};
    (db.users || []).forEach(function (u) { usersById[u.id] = u; });

    var cases = (db.cases || []).slice().sort(function (a, b) { return a.id - b.id; });

    cases.forEach(function (row) {
      var payload = row.payload || {};
      var state = payload.state || {};
      var computed = payload.computed || {};
      var results = payload.results || {};
      var cust = state.customer || {};
      var ic = icDigits(cust.ic || row.customer_ic);
      var custKey = ic || ('CASE#' + row.id);

      /* ---- customer (one row per IC, first case wins) ---- */
      var customerId = customersByIC[custKey];
      if (!customerId) {
        customerId = nextId('customer');
        customersByIC[custKey] = customerId;
        emit(out, counts, 'customer', withKeys(customerId, custKey, 'customer',
          ['ic_formatted', 'full_name', 'birth_date',
           'age_years', 'gender', 'birth_state_code', 'customer_type',
           'customer_class', 'segment', 'first_seen_at', 'last_seen_at'],
          [q(formatIC(ic)), q(cust.name || row.customer_name),
           dt(birthDateFromIC(ic)), i(ageFromIC(ic)), q(genderFromIC(ic)),
           q(birthStateFromIC(ic)), q(cust.type || row.customer_type),
           q(cust.cardType || row.customer_class), q(cust.segment),
           ts(row.created_at), ts(row.updated_at)]));
      }

      /* ---- credit report ---- */
      var reportId = nextId('credit_report');
      var maker = usersById[row.created_by];
      var checker = usersById[row.assigned_checker_id];
      emit(out, counts, 'credit_report', withKeys(reportId, custKey, 'credit_report',
        ['case_id', 'report_date', 'bureau',
         'data_source', 'imported_by', 'imported_at', 'schema_version'],
        [row.id, dt(state.reportDate || row.report_date),
         q(cust.fromExperian ? 'EXPERIAN' : 'MANUAL'),
         q(cust.fromExperian ? 'EXPERIAN' : 'MANUAL'),
         q(maker ? maker.username : null), ts(row.submitted_at || row.created_at),
         SCHEMA_VERSION]));

      var iScore = (state.iScore === '' || state.iScore == null) ? row.iscore : state.iScore;
      var grade = riskGrade(iScore);
      emit(out, counts, 'report_credit_score', withKeys(nextId('report_credit_score'), custKey, 'report_credit_score',
        ['report_id', 'iscore', 'risk_grade', 'risk_band', 'data_source'],
        [reportId, i(iScore), i(grade), q(riskBand(grade)),
         q(cust.fromExperian ? 'EXPERIAN' : 'MANUAL')]));

      /* ---- CCRIS accounts + facility lines ---- */
      var cardType = cust.cardType || 'TYPE A';
      var variant = String(row.mode || '').indexOf('hf') !== -1 ? 'HF' : undefined;
      var groups = groupAccounts(state.ccris);
      var agg = {
        // noLimit counts lines the report printed without a limit (a term
        // facility's limit sits on the parent item, not the line). With any
        // of those in the bucket the "outstanding against limit" percentage
        // has no honest denominator, so it is left NULL rather than
        // published as a number well over 100%.
        SECURED: { count: 0, out: 0, lim: 0, noLimit: 0 },
        UNSECURED: { count: 0, out: 0, lim: 0, noLimit: 0 },
        cardOut: 0, cardLimit: 0, totalOut: 0, totalLimit: 0
      };

      groups.forEach(function (g) {
        var accountId = nextId('ccris_account');
        emit(out, counts, 'ccris_account', withKeys(accountId, custKey, 'ccris_account',
          ['report_id', 'item_no', 'approval_date', 'capacity',
           'collateral_type', 'total_limit', 'data_source'],
          [reportId, i(g.no), dt(g.date), q(g.capacity),
           q(g.collateral), m(g.limit),
           q(g.lines[0] && g.lines[0].sourceSection === 'CCRIS' ? 'EXPERIAN' : 'MANUAL')]));

        g.lines.forEach(function (r, li) {
          var facilityId = nextId('ccris_facility');
          var commitment = lineCommitment(r, cardType, variant);
          var unsec = isUnsecured(r);
          var o = Math.abs(num(r.outstanding)), lim = Math.abs(num(r.limit));
          var util = lim > 0 ? (o / lim) * 100 : null;

          var bucket = unsec === 1 ? 'UNSECURED' : 'SECURED';
          agg[bucket].count++;
          agg[bucket].out += o;
          agg[bucket].lim += lim;
          if (!lim) agg[bucket].noLimit++;
          agg.totalOut += o;
          agg.totalLimit += lim;
          if (String(r.facility || '').toUpperCase() === 'CRDTCARD') {
            agg.cardOut += o;
            agg.cardLimit += lim;
          }

          emit(out, counts, 'ccris_facility', withKeys(facilityId, custKey, 'ccris_facility',
            ['account_id', 'report_id', 'line_no', 'facility_code',
             'outstanding_amount', 'limit_amount', 'instalment_amount',
             'utilisation_pct', 'legal_status', 'is_floating', 'is_unsecured',
             'monthly_commitment', 'commitment_override', 'stress_commitment',
             'source_section', 'data_source'],
            [accountId, reportId, li + 1, q(r.facility),
             m(o), lim ? m(lim) : 'NULL', m(r.commitmentPerCCRIS),
             util == null ? 'NULL' : n(Math.round(util * 100) / 100),
             q(r.legalStatus),
             b(String(r.floating || '').toUpperCase() === 'YES'), b(unsec),
             m(commitment), m(r.override), m(stressOf(r, commitment)),
             q(r.sourceSection || 'USER_ADDED'),
             q(r.sourceSection === 'CCRIS' ? 'EXPERIAN' : 'MANUAL')]));
        });
      });

      /* ---- NLCI (non-bank lenders) ---- */
      (state.ccris || []).filter(function (r) { return r.sourceSection === 'NLCI'; })
        .forEach(function (r) {
          var commitment = lineCommitment(r, cardType, variant);
          agg.totalOut += Math.abs(num(r.outstanding));
          agg.totalLimit += Math.abs(num(r.limit));
          emit(out, counts, 'nlci_account', withKeys(nextId('nlci_account'), custKey, 'nlci_account',
            ['report_id', 'item_no', 'approval_date', 'capacity',
             'facility_code', 'collateral_type', 'limit_amount',
             'instalment_amount', 'outstanding_amount', 'legal_status',
             'monthly_commitment', 'data_source'],
            [reportId, i(r.no), dt(r.date), q(r.capacity),
             q(r.facility), q(r.collateral), m(r.limit), m(r.commitmentPerCCRIS),
             m(r.outstanding), q(r.legalStatus), m(commitment), q('EXPERIAN')]));
        });

      /* ---- derived summary panels ----
         The extractor does not read the summary boxes off the PDF yet, so
         these are recomputed from the detail lines above and flagged
         DERIVED. Same arithmetic the report itself prints. */
      ['SECURED', 'UNSECURED'].forEach(function (seg) {
        var a = agg[seg];
        if (!a.count) return;
        emit(out, counts, 'report_facility_summary', withKeys(nextId('report_facility_summary'), custKey, 'report_facility_summary',
          ['report_id', 'segment', 'facility_count', 'total_outstanding',
           'total_limit', 'outstanding_vs_limit_pct', 'data_source'],
          [reportId, q(seg), a.count, m(a.out), m(a.lim),
           (a.lim > 0 && !a.noLimit) ? n(Math.round((a.out / a.lim) * 10000) / 100) : 'NULL',
           q('DERIVED')]));
      });

      emit(out, counts, 'report_liability_summary', withKeys(nextId('report_liability_summary'), custKey, 'report_liability_summary',
        ['report_id', 'capacity', 'outstanding_amount', 'total_limit', 'data_source'],
        [reportId, q('BORROWER'), m(agg.totalOut), m(agg.totalLimit), q('DERIVED')]));

      emit(out, counts, 'report_summary_credit_info', withKeys(nextId('report_summary_credit_info'), custKey, 'report_summary_credit_info',
        ['report_id', 'existing_facility_count', 'data_source'],
        [reportId, groups.length, q('DERIVED')]));

      if (agg.cardLimit > 0) {
        emit(out, counts, 'report_utilisation', withKeys(nextId('report_utilisation'), custKey, 'report_utilisation',
          ['report_id', 'credit_card_avg_util_6m_pct', 'data_source'],
          [reportId, n(Math.round((agg.cardOut / agg.cardLimit) * 10000) / 100), q('DERIVED')]));
      }

      /* ---- the case itself ---- */
      emit(out, counts, 'dsr_case', withKeys(row.id, custKey, 'dsr_case',
        ['reference', 'report_id', 'mode', 'status',
         'maker_username', 'maker_name', 'checker_username', 'checker_name',
         'gross_income', 'net_income', 'total_commitment', 'bt_total',
         'grand_total', 'unsecured_total', 'stress_total', 'verdict',
         'dsr_ratio', 'ndi_amount', 'edit_count', 'return_count', 'submitted_at',
         'returned_at', 'return_notes', 'decided_at',
         'decision_notes', 'created_at', 'updated_at'],
        [q(row.reference), reportId, q(row.mode), q(row.status),
         q(maker ? maker.username : null), q(maker ? maker.name : null),
         q(checker ? checker.username : null), q(checker ? checker.name : null),
         m(row.gross_income), m(row.net_income), m(computed.totalCommitment),
         m(computed.btTotal), m(computed.grandTotal), m(computed.unsecuredTotal),
         m(computed.stressTotal), q(row.verdict), n(row.dsr_value),
         m(row.ndi_value), i(row.edit_count), i(row.return_count), ts(row.submitted_at),
         ts(row.returned_at), q(row.return_notes), ts(row.decided_at),
         q(row.decision_notes), ts(row.created_at),
         ts(row.updated_at)]));

      /* ---- maker/checker comment thread (returns, resubmissions, decisions) ---- */
      (Array.isArray(row.comments) ? row.comments : []).forEach(function (cm, idx) {
        emit(out, counts, 'dsr_case_comment', withKeys(nextId('dsr_case_comment'), custKey, 'dsr_case_comment',
          ['case_id', 'seq', 'comment_type', 'author_name', 'author_role', 'comment_text', 'commented_at'],
          [row.id, idx + 1, q(cm.type), q(cm.by_name), q(cm.by_role), q(cm.text), ts(cm.at)]));
      });

      /* ---- income, main applicant + any HF joint applicants ---- */
      var applicants = [{
        key: 'MAIN', name: cust.name, ic: ic, iScore: iScore,
        type: cust.type, mode: state.income ? state.income.normalMode : 'MANUAL',
        inc: state.income || {}, gross: computed.grossIncome, net: computed.netIncome
      }];
      ['A', 'B'].forEach(function (k) {
        var j = (state.hfJoint || {})[k];
        if (!j || !j.enabled) return;
        applicants.push({
          key: k, name: j.name, ic: icDigits(j.ic), iScore: j.iScore,
          type: j.type, mode: j.incomeMode,
          inc: { manualMonths: j.months, epf: j.epf, bizman: j.bizman },
          gross: null, net: null
        });
      });

      applicants.forEach(function (ap) {
        var incomeId = nextId('case_income');
        var mode = ap.type === 'BIZMAN' ? 'BIZMAN' : (ap.mode || 'MANUAL');
        var ded = (ap.inc.epf && ap.inc.epf.deductions) || {};
        var bz = ap.inc.bizman || {};
        emit(out, counts, 'case_income', withKeys(incomeId, custKey, 'case_income',
          ['case_id', 'applicant_key', 'applicant_name', 'applicant_ic',
           'applicant_iscore', 'customer_type', 'income_mode', 'gross_income',
           'net_income', 'epf_rate_pct', 'deduction_epf', 'deduction_pcb',
           'deduction_socso', 'deduction_other', 'profit_margin_pct',
           'shareholding_pct', 'avg_itr_annual', 'tax_deduction'],
          [row.id, q(ap.key), q(ap.name), q(ap.ic), i(ap.iScore),
           q(ap.type || 'NORMAL'), q(mode), m(ap.gross), m(ap.net),
           n(ap.inc.epf ? ap.inc.epf.epfRatePct : null), m(ded.epf), m(ded.pcb),
           m(ded.socso), m(ded.other), n(bz.profitMarginPct), n(bz.shareholdingPct),
           m(bz.avgITRAnnual), m(bz.taxDeduction)]));

        incomeMonths(ap.inc, ap.type, ap.mode).forEach(function (mo) {
          if (mo.stream === 'BUSINESS' && !num(mo.bank1) && !num(mo.bank2)) return;
          if (mo.stream === 'SALARY' && !num(mo.basic) && !num(mo.fixedAllowance)
              && !num(mo.other) && !num(mo.commission) && !num(mo.ot)) return;
          if (mo.stream === 'EPF' && !num(mo.epfEmployee)) return;
          emit(out, counts, 'case_income_month', withKeys(nextId('case_income_month'), custKey, 'case_income_month',
            ['income_id', 'month_seq', 'month_label', 'stream',
             'basic', 'fixed_allowance', 'fixed_allowance_desc', 'other_allowance',
             'commission', 'overtime', 'epf_employee', 'epf_deduction', 'pcb',
             'socso', 'bank1_credit', 'bank2_credit'],
            [incomeId, mo.seq, q(mo.label), q(mo.stream),
             m(mo.basic), m(mo.fixedAllowance), q(mo.fixedAllowanceDesc), m(mo.other),
             m(mo.commission), m(mo.ot), m(mo.epfEmployee), m(mo.epf), m(mo.pcb),
             m(mo.socso), m(mo.bank1), m(mo.bank2)]));
        });
      });

      /* ---- balance transfers / settlements ---- */
      (state.bt || []).forEach(function (r) {
        emit(out, counts, 'case_balance_transfer', withKeys(nextId('case_balance_transfer'), custKey, 'case_balance_transfer',
          ['case_id', 'applicant_key', 'bt_type', 'facility_code',
           'outstanding_amount', 'monthly_repayment'],
          [row.id, q('MAIN'), q(r.type || 'BT'),
           q(r.facility), m(r.outstanding),
           m(r.type === 'BT' && window.Engine && Engine.btRepayment
             ? Engine.btRepayment(r.outstanding) : r.repayment)]));
      });

      /* ---- product applications ---- */
      var mode = String(row.mode || '');
      var appCtx = {
        out: out, counts: counts, nextId: nextId, row: row, state: state,
        computed: computed, results: results, reportId: reportId,
        cic: custKey, iScore: iScore, grade: grade,
        approved: String(row.status) === 'approved' ? 1
          : (String(row.status) === 'rejected' ? 0 : null),
        // PF+HF and HF+CC divide the home instalment across the applicants and
        // score each person separately, so a single main-applicant ratio would
        // not be the figure the checker saw. On those cases the per-product
        // DSR columns stay NULL and the real per-applicant arithmetic goes in
        // combo_pf_hf / combo_hf_cc below.
        splitPerApplicant: (mode === 'pf-hf' || mode === 'hf-cc'),
        applicants: applicantList(state),
        hf: null   // filled lazily by hfSummary()
      };
      appCtx.hfSummary = function () {
        if (appCtx.hf === null) appCtx.hf = hfSummaryOf(state) || false;
        return appCtx.hf || null;
      };

      var pfApps = mode.indexOf('pf') !== -1 ? emitPF(appCtx) : {};
      var hfApp = mode.indexOf('hf') !== -1 ? emitHF(appCtx) : null;
      var ccApps = mode.indexOf('cc') !== -1 ? emitCC(appCtx) : {};
      emitCombos(appCtx, mode, pfApps, hfApp, ccApps);
    });

    return { sql: out.join('\n'), counts: counts, caseCount: cases.length };
  }

  /** Shared loan_application header row. Returns the new application_id.
      Figures default to the main-applicant pot; a per-applicant combo
      passes that applicant's own income and existing commitment instead. */
  function emitHeader(c, product, extra) {
    var id = c.nextId('loan_application');
    if (c.splitPerApplicant) {
      // the ratio for these cases lives in combo_hf_cc / combo_pf_hf
      extra.newCommitment = null;
      extra.dsr = null;
      extra.threshold = null;
      extra.ndi = null;
    }
    var gross = extra.gross === undefined ? c.computed.grossIncome : extra.gross;
    var net = extra.net === undefined ? c.computed.netIncome : extra.net;
    var existing = extra.existing === undefined ? c.computed.grandTotal : extra.existing;
    emit(c.out, c.counts, 'loan_application', withKeys(id, c.cic, 'loan_application',
      ['case_id', 'report_id', 'product_code',
       'applicant_key', 'applicant_name', 'gross_income', 'net_income',
       'existing_commitment', 'new_instalment', 'new_commitment', 'dsr_ratio',
       'dsr_threshold_ratio', 'ndi_amount', 'verdict', 'is_approved', 'created_at'],
      [c.row.id, c.reportId, q(product),
       q(extra.applicantKey || 'MAIN'), q(extra.applicantName || c.row.customer_name),
       m(gross), m(net), m(existing),
       m(extra.instalment), m(extra.newCommitment), n(extra.dsr), n(extra.threshold),
       m(extra.ndi), q(extra.verdict), b(extra.approved), ts(c.row.submitted_at)]));
    return id;
  }

  /** That applicant's own income + existing commitment (L57). MAIN keeps the
      shared intake's figures; a joint applicant gets theirs off the HF
      Summary, exactly as panels.js applicantExisting() does. */
  function applicantFinance(c, key) {
    if (key === 'MAIN' || !c.splitPerApplicant) {
      return {
        gross: num(c.computed.grossIncome), net: num(c.computed.netIncome),
        existing: num(c.computed.grandTotal)
      };
    }
    var pers = personalIncome(c.state, key);
    var existing = 0;
    var hf = c.hfSummary();
    if (hf) {
      hf.perApplicant.forEach(function (p) { if (p.key === key) existing = p.l57; });
    }
    return { gross: pers.gross, net: pers.net, existing: existing };
  }

  function applicantNameOf(c, key) {
    var hit = c.applicants.filter(function (a) { return a.key === key; })[0];
    return hit ? hit.name : null;
  }

  /** @return {applicantKey: {appId, instalment}} */
  function emitPF(c) {
    var p = c.state.pf || {};
    var apps = (p.apps && p.apps.length) ? p.apps
      : [{ applicant: 'MAIN', amount: p.amount, tenureMonths: p.tenureMonths, deviationPct: p.deviationPct }];
    var byApplicant = {};

    apps.forEach(function (a) {
      var key = a.applicant || 'MAIN';
      var amount = num(a.amount), months = num(a.tenureMonths);
      if (!amount && !months) return;
      var fin = applicantFinance(c, key);
      // each application is priced on ITS applicant's own iScore
      var iScore = key === 'MAIN' ? c.iScore : applicantIScore(c.state, key);
      var grade = key === 'MAIN' ? c.grade : riskGrade(iScore);
      var rates = (window.Engine && Engine.lookupPFRates)
        ? Engine.lookupPFRates(fin.gross, amount, months, grade)
        : { product: null, flat: null, epr: null };
      var deviation = num(a.deviationPct);
      var rateFrac = deviation > 0 ? deviation / 100 : rates.flat;
      var instalment = (rateFrac != null && window.Engine && Engine.flatInstalment)
        ? Engine.flatInstalment(amount, rateFrac, months) : null;
      var newCommitment = instalment == null ? null : fin.existing + instalment;
      var dsr = (newCommitment != null && fin.net > 0) ? newCommitment / fin.net : null;
      var ndi = newCommitment == null ? null : fin.net - newCommitment;
      // PF thresholds move with income band AND customer class; a joint
      // applicant's class comes off their own gross, as panels.js does.
      var cardType = key === 'MAIN' ? (c.state.customer || {}).cardType
        : (fin.gross >= (Engine.CONFIG ? Engine.CONFIG.classBreak : Infinity) ? 'TYPE B' : 'TYPE A');
      var pfV = (window.Engine && Engine.pfVerdict && dsr != null)
        ? Engine.pfVerdict(fin.gross, cardType, dsr, ndi) : null;

      var appId = emitHeader(c, 'PF', {
        applicantKey: key, applicantName: applicantNameOf(c, key),
        gross: fin.gross, net: fin.net, existing: fin.existing,
        instalment: instalment, newCommitment: newCommitment, dsr: dsr,
        threshold: pfV ? pfV.threshold : null,
        ndi: ndi,
        verdict: c.results.verdict, approved: c.approved
      });

      emit(c.out, c.counts, 'personal_loan_application', withKeys(c.nextId('personal_loan_application'), c.cic, 'personal_loan_application',
        ['application_id', 'financing_amount', 'tenure_months', 'pf_product',
         'risk_grade', 'flat_rate_pct', 'epr_rate_pct', 'deviation_rate_pct',
         'rate_used_pct', 'monthly_instalment', 'ndi_minimum'],
        [appId, m(amount), i(months), q(rates.product), i(grade),
         n(rates.flat == null ? null : rates.flat * 100),
         n(rates.epr == null ? null : rates.epr * 100),
         n(deviation || null), n(rateFrac == null ? null : rateFrac * 100),
         m(instalment), m(pfV ? pfV.ndiMin : null)]));

      byApplicant[key] = { appId: appId, instalment: instalment || 0 };
    });
    return byApplicant;
  }

  /** @return {appId, instalment, applicantCount} for the one home financing */
  function emitHF(c) {
    var h = c.state.hf || {};
    var isHOA = h.product === 'HOME ONE ACCOUNT';
    var terms = isHOA
      ? [{ no: 1, t: (h.hoa || {}).t1 || {} }, { no: 2, t: (h.hoa || {}).t2 || {} }]
      : [{ no: 1, t: h }];
    var propertyValue = isHOA ? num((h.hoa || {}).propertyValue) : num(h.propertyValue);

    var computedTerms = terms.map(function (x) {
      var t = x.t;
      var r = (window.Engine && Engine.hfTerm) ? Engine.hfTerm(t) : null;
      return { no: x.no, src: t, r: r };
    });
    var totalFinancing = 0, totalFec = 0, instalment = 0, anyTerm = false;
    computedTerms.forEach(function (x) {
      if (!x.r) return;
      anyTerm = true;
      totalFinancing += x.r.totalFinancing;
      totalFec += x.r.fec;
      instalment += x.r.instalment;
    });
    if (!anyTerm && !num(h.financing)) return null;

    var ctf = num(h.ctf);
    var net = num(c.computed.netIncome);
    var chargedInstalment = ctf !== 0 ? ctf : instalment;
    var newCommitment = num(c.computed.grandTotal) + chargedInstalment;
    var applicantCount = c.applicants.length;

    var appId = emitHeader(c, 'HF', {
      instalment: chargedInstalment,
      newCommitment: newCommitment,
      dsr: net > 0 ? newCommitment / net : null,
      ndi: net > 0 ? net - newCommitment : null,
      verdict: c.results.verdict, approved: c.approved
    });

    var homeLoanId = c.nextId('home_loan_application');
    emit(c.out, c.counts, 'home_loan_application', withKeys(homeLoanId, c.cic, 'home_loan_application',
      ['application_id', 'hf_product', 'property_value', 'total_financing',
       'total_fec', 'margin_of_financing_pct', 'monthly_instalment',
       'ctf_instalment', 'applicant_count', 'hf_customer_class'],
      [appId, q(h.product || 'HOME FINANCING'), m(propertyValue), m(totalFinancing),
       m(totalFec),
       propertyValue > 0 ? n(Math.round((totalFinancing / propertyValue) * 10000) / 100) : 'NULL',
       m(instalment), ctf ? m(ctf) : 'NULL', applicantCount,
       q((c.state.customer || {}).cardType)]));

    computedTerms.forEach(function (x) {
      if (!x.r) return;
      var t = x.src;
      emit(c.out, c.counts, 'home_loan_term', withKeys(c.nextId('home_loan_term'), c.cic, 'home_loan_term',
        ['home_loan_id', 'application_id', 'term_no', 'financing_amount',
         'renovation_amount', 'mrtt_contribution', 'valuation_cost', 'legal_cost',
         'fec', 'total_financing', 'tenure_years', 'sbr_pct', 'spread_pct',
         'effective_rate_pct', 'monthly_instalment'],
        [homeLoanId, appId, x.no, m(t.financing), m(t.renovation),
         m(t.mrtt), m(t.valuation), m(t.legal), m(x.r.fec), m(x.r.totalFinancing),
         n(t.tenureYears), n(t.sbrPct), n(t.spreadPct),
         n(Math.round(x.r.effectiveRate * 1000000) / 10000), m(x.r.instalment)]));
    });

    return { appId: appId, instalment: chargedInstalment, applicantCount: applicantCount };
  }

  /** @return {applicantKey: {appId, instalment}} */
  function emitCC(c) {
    var cc = c.state.cc || {};
    var cards = (cc.cards && cc.cards.length) ? cc.cards
      : [{ applicant: 'MAIN', product: cc.product, proposedLimit: cc.proposedLimit, useProposed: cc.useProposed }];
    var byApplicant = {};

    cards.forEach(function (card) {
      var key = card.applicant || 'MAIN';
      var fin = applicantFinance(c, key);
      var iScore = key === 'MAIN' ? c.iScore : applicantIScore(c.state, key);
      var original = (window.Engine && Engine.calculateMaxCreditLimit)
        ? Engine.calculateMaxCreditLimit(fin.gross, iScore, card.product) : null;
      var active = original;
      if (original && card.useProposed && num(card.proposedLimit) > 0 && Engine.evaluateProposedLimit) {
        active = Engine.evaluateProposedLimit(card.proposedLimit, card.product);
        active.multiplier = original.multiplier;
      }
      if (!active) return;
      var instalment = active.monthlyInstallment;
      var newCommitment = fin.existing + instalment;
      var thresholdPct = (window.Engine && Engine.ccDsrThreshold) ? Engine.ccDsrThreshold(fin.gross) : null;

      var appId = emitHeader(c, 'CC', {
        applicantKey: key, applicantName: applicantNameOf(c, key),
        gross: fin.gross, net: fin.net, existing: fin.existing,
        instalment: instalment, newCommitment: newCommitment,
        dsr: fin.net > 0 ? newCommitment / fin.net : null,
        threshold: thresholdPct == null ? null : thresholdPct / 100,
        ndi: fin.net > 0 ? fin.net - newCommitment : null,
        verdict: c.results.verdict, approved: c.approved
      });

      emit(c.out, c.counts, 'credit_card_application', withKeys(c.nextId('credit_card_application'), c.cic, 'credit_card_application',
        ['application_id', 'card_product', 'income_multiplier', 'max_eligible_limit',
         'proposed_limit', 'approved_limit', 'is_eligible_by_limit',
         'monthly_instalment', 'dsr_threshold_pct'],
        [appId, q(card.product), n(active.multiplier),
         m(original ? original.maxCreditLimit : null),
         card.useProposed ? m(card.proposedLimit) : 'NULL',
         m(active.maxCreditLimit), b(active.isEligibleByLimit), m(instalment),
         n(thresholdPct)]));

      byApplicant[key] = { appId: appId, instalment: instalment || 0 };
    });
    return byApplicant;
  }

  /* ============================================================
     Combos. Two products assessed together are not two independent
     applications, and the way their DSR is built differs by pair -
     so each pair gets its own table rather than a generic one.
     ============================================================ */

  function comboHeader(c, comboType, basis, applicantCount, verdict, approved) {
    var id = c.nextId('combo_application');
    emit(c.out, c.counts, 'combo_application', withKeys(id, c.cic, 'combo_application',
      ['case_id', 'report_id', 'combo_type',
       'scoring_basis', 'applicant_count', 'verdict', 'is_approved', 'created_at'],
      [c.row.id, c.reportId, q(comboType), q(basis),
       applicantCount, q(verdict), b(approved), ts(c.row.submitted_at)]));
    return id;
  }

  function emitCombos(c, mode, pfApps, hfApp, ccApps) {
    if (mode === 'pf-cc') return emitComboPFCC(c, pfApps, ccApps);
    if (mode === 'hf-cc') return emitComboPerApplicant(c, 'HF_CC', hfApp, ccApps);
    if (mode === 'pf-hf') return emitComboPerApplicant(c, 'PF_HF', hfApp, pfApps);
  }

  /** PF+CC: both instalments land on the main applicant's own income and the
      governing threshold is the TIGHTER of the two products' thresholds
      (js/panels.js combinedDecisionData, 'single' branch). */
  function emitComboPFCC(c, pfApps, ccApps) {
    var pf = pfApps.MAIN, cc = ccApps.MAIN;
    if (!pf && !cc) return;
    var pfInst = pf ? pf.instalment : 0;
    var ccInst = cc ? cc.instalment : 0;
    var gross = num(c.computed.grossIncome), net = num(c.computed.netIncome);
    var existing = num(c.computed.grandTotal);
    var newCommitment = existing + pfInst + ccInst;
    var dsr = net > 0 ? newCommitment / net : 0;
    var ndi = net - newCommitment;

    var pfThreshold = null, ccThreshold = null;
    if (pf && window.Engine && Engine.pfVerdict) {
      pfThreshold = Engine.pfVerdict(gross, (c.state.customer || {}).cardType, dsr, ndi).threshold;
    }
    if (cc && window.Engine && Engine.ccDsrThreshold) {
      ccThreshold = Engine.ccDsrThreshold(gross) / 100;
    }
    var valid = [pfThreshold, ccThreshold].filter(function (t) { return t > 0; });
    var governing = valid.length ? Math.min.apply(null, valid) : null;

    var comboId = comboHeader(c, 'PF_CC', 'SINGLE_POT', 1, c.results.verdict, c.approved);
    emit(c.out, c.counts, 'combo_pf_cc', withKeys(c.nextId('combo_pf_cc'), c.cic, 'combo_pf_cc',
      ['combo_id', 'case_id', 'pf_application_id', 'cc_application_id',
       'pf_instalment', 'cc_instalment', 'existing_commitment', 'new_commitment',
       'gross_income', 'net_income', 'dsr_ratio', 'pf_threshold_ratio',
       'cc_threshold_ratio', 'governing_threshold_ratio', 'ndi_amount',
       'verdict', 'is_approved'],
      [comboId, c.row.id, pf ? pf.appId : 'NULL', cc ? cc.appId : 'NULL',
       m(pfInst), m(ccInst), m(existing), m(newCommitment), m(gross), m(net),
       net > 0 ? n(dsr) : 'NULL', n(pfThreshold), n(ccThreshold), n(governing),
       m(ndi), q(c.results.verdict), b(c.approved)]));
  }

  /** HF+CC and PF+HF: the home instalment is split evenly across the
      applicants and each person is scored on their own income, their own
      L57 and their own second product (js/panels.js 'per-applicant' branch).
      One row per applicant. */
  function emitComboPerApplicant(c, comboType, hfApp, otherApps) {
    if (!hfApp) return;
    var table = comboType === 'HF_CC' ? 'combo_hf_cc' : 'combo_pf_hf';
    var otherIdCol = comboType === 'HF_CC' ? 'cc_application_id' : 'pf_application_id';
    var otherInstCol = comboType === 'HF_CC' ? 'cc_instalment' : 'pf_instalment';

    var apps = c.applicants;
    var count = apps.length || 1;
    var share = hfApp.instalment / count;
    var rows = apps.map(function (a) {
      var fin = applicantFinance(c, a.key);
      var other = otherApps[a.key];
      var otherInst = other ? other.instalment : 0;
      var commit = share + fin.existing + otherInst;
      var dsr = fin.net > 0 ? commit / fin.net : 0;
      var threshold = (window.Engine && Engine.hfThreshold)
        ? Engine.hfThreshold(fin.gross, applicantType(c.state, a.key)) : null;
      return {
        key: a.key, name: a.name, fin: fin, other: other, otherInst: otherInst,
        commit: commit, dsr: dsr, threshold: threshold,
        ok: (dsr > 0 && threshold > 0 && dsr <= threshold) ? 1 : 0
      };
    });
    var allOk = rows.length > 0 && rows.every(function (r) { return r.ok === 1; });

    var comboId = comboHeader(c, comboType, 'PER_APPLICANT', count,
      allOk ? 'APPROVED' : 'REJECTED', c.approved);

    rows.forEach(function (r) {
      emit(c.out, c.counts, table, withKeys(c.nextId(table), c.cic, table,
        ['combo_id', 'case_id', 'applicant_key', 'applicant_name',
         'applicant_type', 'applicant_iscore', 'hf_application_id', otherIdCol,
         'hf_instalment_total', 'applicant_count', 'hf_instalment_share',
         otherInstCol, 'existing_commitment', 'new_commitment',
         'personal_gross_income', 'personal_net_income', 'dsr_ratio',
         'dsr_threshold_ratio', 'ndi_amount', 'is_approved'],
        [comboId, c.row.id, q(r.key), q(r.name),
         q(applicantType(c.state, r.key)), i(applicantIScore(c.state, r.key)),
         hfApp.appId, r.other ? r.other.appId : 'NULL',
         m(hfApp.instalment), count, m(share), m(r.otherInst), m(r.fin.existing),
         m(r.commit), m(r.fin.gross), m(r.fin.net),
         r.fin.net > 0 ? n(r.dsr) : 'NULL', n(r.threshold),
         m(r.fin.net - r.commit), r.ok]));
    });
  }

  /* ============================================================
     Public API
     ============================================================ */

  function loadSchema() {
    return fetch(SCHEMA_URL, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).catch(function (e) {
      throw new Error('Could not read ' + SCHEMA_URL + ' (' + (e.message || e) + '). ' +
        'Serve the app over http:// - the schema is a file, not inline SQL.');
    });
  }

  function header(counts, caseCount) {
    var lines = [
      '-- ============================================================',
      '--  ARBM DSR Calculator - report data export',
      '--  generated : ' + new Date().toISOString(),
      '--  cases     : ' + caseCount,
      '--  schema    : report_schema.sql v' + SCHEMA_VERSION,
      '--',
      '--  Load with:  sqlite3 report_data.db < this-file.sql',
      '--',
      '--  Row counts in this dump:'
    ];
    Object.keys(counts).sort().forEach(function (t) {
      lines.push('--    ' + t + new Array(Math.max(1, 30 - t.length)).join(' ') + counts[t]);
    });
    lines.push('-- ============================================================');
    lines.push('');
    return lines.join('\n');
  }

  /** Full dump: schema DDL + data, wrapped in one transaction. */
  function buildDump() {
    var data = buildData();
    return loadSchema().then(function (ddl) {
      return header(data.counts, data.caseCount) + '\n' + ddl +
        '\n\nBEGIN TRANSACTION;\n\n' + data.sql + '\n\nCOMMIT;\n';
    });
  }

  /** Data only - for topping up a database that already has the schema. */
  function buildInserts() {
    var data = buildData();
    return header(data.counts, data.caseCount) + '\nPRAGMA foreign_keys = ON;\n\n' +
      'BEGIN TRANSACTION;\n\n' + data.sql + '\n\nCOMMIT;\n';
  }

  /* ============================================================
     A real SQLite database, in the browser.

     vendor/sql-wasm.js is SQLite compiled to WebAssembly (sql.js, MIT).
     The schema + INSERTs above are executed against a fresh in-memory
     database, which then serves two purposes: the admin can run SELECTs
     against it on the page, and db.export() gives the actual .db file -
     the same bytes sqlite3 would have written.
     ============================================================ */
  var dbPromise = null;

  function database() {
    if (dbPromise) return dbPromise;
    if (typeof initSqlJs !== 'function') {
      return Promise.reject(new Error(
        'SQLite engine not loaded - this page needs <script src="/vendor/sql-wasm.js">.'));
    }
    var data = buildData();
    dbPromise = loadSchema().then(function (ddl) {
      return initSqlJs({ locateFile: function (f) { return '/vendor/' + f; } })
        .then(function (SQL) {
          var db = new SQL.Database();
          db.run(ddl);
          if (data.sql) db.run(data.sql);
          return db;
        });
    });
    // a failed build must not poison every later attempt
    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }

  /** @return Promise<[{columns, values}]> - sql.js result shape. */
  function query(sql) {
    return database().then(function (db) { return db.exec(sql); });
  }

  /** Every table name in the built database, in schema order. */
  function tableNames() {
    return query("SELECT name FROM sqlite_master WHERE type='table' " +
                 "AND name NOT LIKE 'sqlite_%' ORDER BY rowid")
      .then(function (res) {
        return (res[0] ? res[0].values : []).map(function (r) { return r[0]; });
      });
  }

  /** The .db file itself - the bytes sqlite3 would have written. */
  function downloadDatabase() {
    return database().then(function (db) {
      downloadBlob(new Blob([db.export()], { type: 'application/x-sqlite3' }),
        'dsr-report-data-{stamp}.db');
    });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    var a = document.createElement('a');
    a.href = url;
    a.download = name.replace('{stamp}', stamp);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function download(text, name) {
    var blob = new Blob([text], { type: 'application/sql' });
    var url = URL.createObjectURL(blob);
    var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    var a = document.createElement('a');
    a.href = url;
    a.download = name.replace('{stamp}', stamp);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.ReportSql = {
    SCHEMA_URL: SCHEMA_URL,
    SCHEMA_VERSION: SCHEMA_VERSION,
    buildData: buildData,
    buildDump: buildDump,
    buildInserts: buildInserts,
    loadSchema: loadSchema,
    download: download,
    // real SQLite (vendor/sql-wasm.js)
    query: query,
    tableNames: tableNames,
    downloadDatabase: downloadDatabase
  };
})();
