/* ============================================================
   core/applicants.js - joint applicant helpers (HF joint A/B,
   applicant list, per-applicant income). Used by PF, HF and CC
   when a combo or a joint applicant is involved.
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;
  var esc = App.mod.ui.esc;
  var HF_CAPACITIES = ['OWN', 'JOINT', 'GUARANTOR', 'DIRECTOR'];
  var HF_COLLATERALS = ['', 'PROPERTIES', 'CLEAN', 'MOTOR V (JPJ)', 'UNIT TRUST', 'SHARES', 'FIN.ASSTS', 'OTHERS'];
  var HF_MONTH_COLS = [
    ['basic', 'Basic Income'], ['fixedAllowance', 'Fixed Allowance'],
    ['fixedAllowanceDesc', 'Allowance Desc'], ['other', 'Other Income'],
    ['commission', 'Commission'], ['ot', 'OT'],
    ['epf', 'EPF'], ['pcb', 'PCB / Zakat'], ['socso', 'SOCSO']
  ];

  /** Recognised EPF income for an applicant in EPF mode, else null. The
      caller decides whether EPF applies (a BIZMAN applicant never is). */
  function epfIncomeOf(mode, epf) {
    if (mode !== 'EPF') return null;
    return E.calcEPFIncome(
      ((epf && epf.months) || []).map(function (m) { return m.employee; }),
      epf && epf.epfRatePct, epf && epf.deductions);
  }

  function emptyBizBlock() {
    return { months: [], profitMarginPct: '', shareholdingPct: 100, avgITRAnnual: '', taxDeduction: '' };
  }

  /** Resolve one applicant's income contribution by THEIR own type/mode into
      the shape calcHFIncomeMixed sums: payslip months, an EPF recognition, or
      a business block - the other two zeroed so streams never double-count. */
  function resolveApplicantIncome(type, mode, months, bizman, epf) {
    var isBiz = type === 'BIZMAN';
    return {
      months: (isBiz || mode === 'EPF') ? [] : (months || []),
      bizman: isBiz ? bizman : emptyBizBlock(),
      epfIncome: (!isBiz && mode === 'EPF') ? epfIncomeOf('EPF', epf) : null
    };
  }

  /** The resolved income streams for one applicant key (main or joint). */
  function applicantIncomeParts(key) {
    var s = App.state;
    if (key === 'MAIN') {
      return resolveApplicantIncome(s.customer.type, s.income.normalMode,
        s.income.manualMonths, s.income.bizman, s.income.epf);
    }
    var a = s.hfJoint[key] || {};
    return resolveApplicantIncome(a.type, a.incomeMode, a.months, a.bizman, a.epf);
  }

  /** Customer type for one applicant (each may differ in a joint HF). */
  function applicantType(key) {
    return key === 'MAIN' ? App.state.customer.type
      : ((App.state.hfJoint[key] || {}).type || 'NORMAL');
  }

  /** Personal (NOT combined) income for one HF applicant, as {gross, net},
      by THEIR own type - a credit card and each person's DSR run on their own
      income (normal payslip/EPF or business), never the combined pot. */
  function applicantPersonalIncome(key) {
    var inc = E.calcHFIncomeMixed([applicantIncomeParts(key)]);
    return { gross: inc.grossIncome || 0, net: inc.netIncome || 0 };
  }

  /** Experian iScore for one applicant (drives their card risk grade). */
  function applicantIScore(key) {
    return key === 'MAIN' ? App.state.iScore : ((App.state.hfJoint[key] || {}).iScore);
  }

  /** That applicant's own existing commitment after settlement (L57). */
  function applicantExisting(key) {
    if (key === 'MAIN') return App.computed.grandTotal || 0;
    var out = 0;
    App.computeHF().perApplicant.forEach(function (p) { if (p.key === key) out = p.l57; });
    return out;
  }

  /** Display name for an applicant key. */
  function applicantName(key) {
    if (key === 'MAIN') return App.state.customer.name || 'Main Applicant';
    var a = App.state.hfJoint[key] || {};
    return a.name || ('Joint Applicant ' + key);
  }

  /** Enabled HF applicants in order: main first, then joint A / B. */
  function hfApplicantList() {
    var s = App.state;
    var list = [{ key: 'MAIN', name: s.customer.name || 'Main Applicant' }];
    ['A', 'B'].forEach(function (k) {
      var a = s.hfJoint[k];
      if (a && a.enabled) list.push({ key: k, name: a.name || ('Joint Applicant ' + k) });
    });
    return list;
  }

  /** Applicant list for HF: main (shared intake) + enabled joint A/B. Each
      applicant's income is resolved by ITS OWN type (NORMAL payslip/EPF or
      BIZMAN business), so a mixed joint sums correctly in calcHFIncomeMixed. */
  function hfApplicants() {
    var s = App.state;
    function build(key, label, ccris, bt, parts) {
      return { key: key, label: label, ccris: ccris, bt: bt,
        months: parts.months, bizman: parts.bizman, epfIncome: parts.epfIncome };
    }
    var list = [build('MAIN', 'Main Applicant', s.ccris, s.bt, applicantIncomeParts('MAIN'))];
    ['A', 'B'].forEach(function (k) {
      var a = s.hfJoint[k];
      if (a && a.enabled) list.push(build(k, 'Joint Applicant ' + k, a.ccris, a.bt, applicantIncomeParts(k)));
    });
    return list;
  }

  function hfSelect(options, value, attr) {
    return '<select ' + attr + '>' + options.map(function (o) {
      return '<option value="' + esc(o) + '"' + (String(o) === String(value) ? ' selected' : '') + '>' +
        (o === '' ? '-' : esc(o)) + '</option>';
    }).join('') + '</select>';
  }

  App.mod = App.mod || {};
  App.mod.applicants = { HF_CAPACITIES: HF_CAPACITIES, HF_COLLATERALS: HF_COLLATERALS, HF_MONTH_COLS: HF_MONTH_COLS, epfIncomeOf: epfIncomeOf, emptyBizBlock: emptyBizBlock, resolveApplicantIncome: resolveApplicantIncome, applicantIncomeParts: applicantIncomeParts, applicantType: applicantType, applicantPersonalIncome: applicantPersonalIncome, applicantIScore: applicantIScore, applicantExisting: applicantExisting, applicantName: applicantName, hfApplicantList: hfApplicantList, hfApplicants: hfApplicants, hfSelect: hfSelect };
})();
