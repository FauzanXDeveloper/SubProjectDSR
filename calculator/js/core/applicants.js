/* ---------------- applicant helpers ---------------- */

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

  function epfIncomeOf(mode, epf) {
    if (mode !== 'EPF') return null;
    return E.calcEPFIncome(
      ((epf && epf.months) || []).map(function (m) { return m.employee; }),
      epf && epf.epfRatePct, epf && epf.deductions);
  }

  function emptyBizBlock() {
    return { months: [], profitMarginPct: '', shareholdingPct: 100, avgITRAnnual: '', taxDeduction: '' };
  }

  function resolveApplicantIncome(type, mode, months, bizman, epf) {
    var isBiz = type === 'BIZMAN';
    return {
      months: (isBiz || mode === 'EPF') ? [] : (months || []),
      bizman: isBiz ? bizman : emptyBizBlock(),
      epfIncome: (!isBiz && mode === 'EPF') ? epfIncomeOf('EPF', epf) : null
    };
  }

  function applicantIncomeParts(key) {
    var s = App.state;
    if (key === 'MAIN') {
      return resolveApplicantIncome(s.customer.type, s.income.normalMode,
        s.income.manualMonths, s.income.bizman, s.income.epf);
    }
    var a = s.hfJoint[key] || {};
    return resolveApplicantIncome(a.type, a.incomeMode, a.months, a.bizman, a.epf);
  }

  function applicantType(key) {
    return key === 'MAIN' ? App.state.customer.type
      : ((App.state.hfJoint[key] || {}).type || 'NORMAL');
  }

  function applicantPersonalIncome(key) {
    var inc = E.calcHFIncomeMixed([applicantIncomeParts(key)]);
    return { gross: inc.grossIncome || 0, net: inc.netIncome || 0 };
  }

  function applicantIScore(key) {
    return key === 'MAIN' ? App.state.iScore : ((App.state.hfJoint[key] || {}).iScore);
  }

  function applicantExisting(key) {
    if (key === 'MAIN') return App.computed.grandTotal || 0;
    var out = 0;
    App.computeHF().perApplicant.forEach(function (p) { if (p.key === key) out = p.l57; });
    return out;
  }

  function applicantName(key) {
    if (key === 'MAIN') return App.state.customer.name || 'Main Applicant';
    var a = App.state.hfJoint[key] || {};
    return a.name || ('Joint Applicant ' + key);
  }

  function hfApplicantList() {
    var s = App.state;
    var list = [{ key: 'MAIN', name: s.customer.name || 'Main Applicant' }];
    ['A', 'B'].forEach(function (k) {
      var a = s.hfJoint[k];
      if (a && a.enabled) list.push({ key: k, name: a.name || ('Joint Applicant ' + k) });
    });
    return list;
  }

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
