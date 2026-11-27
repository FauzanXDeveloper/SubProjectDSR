/* ---------------- print report ---------------- */

(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;

  var fmt = E.formatAmount;
  var amt = E.formatAmount;
  var pct = E.formatPct;
  var DP = 2;

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isFinite(n) ? n : 0; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function dash(v) { return (v === '' || v == null) ? '-' : v; }

  /* ---------------- small layout helpers ---------------- */
  function section(title, inner) {
    return '<section class="rep-sec"><h2 class="rep-h2">' + esc(title) + '</h2>' + inner + '</section>';
  }

  function dl(pairs, cols) {
    var cells = pairs.map(function (p) {
      return '<div class="rep-dl-item"><dt>' + esc(p[0]) + '</dt><dd>' + (p[2] ? p[1] : esc(p[1])) + '</dd></div>';
    }).join('');
    return '<dl class="rep-dl c' + (cols || 3) + '">' + cells + '</dl>';
  }

  function figures(items) {
    return '<div class="rep-figs">' + items.map(function (i) {
      return '<div class="rep-fig' + (i[2] ? ' ' + i[2] : '') + '">' +
        '<span class="rep-fig-l">' + esc(i[0]) + '</span>' +
        '<span class="rep-fig-v">' + esc(i[1]) + '</span></div>';
    }).join('') + '</div>';
  }
  function tableRows(head, rows) {
    var th = head.map(function (h, i) {
      return '<th' + (i ? ' class="num"' : '') + '>' + esc(h) + '</th>';
    }).join('');
    var body = rows.map(function (r) {
      var cls = r._total ? ' class="rep-total"' : '';
      return '<tr' + cls + '>' + r.cells.map(function (c, i) {
        return '<td' + (i ? ' class="num"' : '') + '>' + esc(c) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<table class="rep-tbl"><thead><tr>' + th + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  /* ---------------- header and footer ---------------- */
function headerHtml(mode) {
    var s = App.state;
    var printed = new Date(App.today() + 'T00:00:00Z')
      .toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return '<header class="rep-head">' +
      '<img class="rep-logo" src="public/alrajhi_logo.png" alt="Al Rajhi Bank Malaysia">' +
      '<div class="rep-head-txt">' +
      '<div class="rep-title">Financing &amp; DSR Evaluation Report</div>' +
      '<div class="rep-sub">' + esc(App.reportLabel(mode)) + '</div>' +
      '</div>' +
      '<div class="rep-head-meta">' +
      '<div><span>Applicant</span>' + esc(s.customer.name || '-') + '</div>' +
      '<div><span>Printed</span>' + esc(printed) + '</div>' +
      '</div></header>';
  }

  function footerHtml() {
    return '<footer class="rep-foot">' +
      'Copyright &copy; ' + new Date().getFullYear() + ' Al Rajhi Banking &amp; Investment Corporation (Malaysia) Bhd<br>' +
      'Built by Retail Credit Risk (RCR) since July 2026<br>' +
      'For internal credit evaluation use only.' +
    '</footer>';
  }

  function shellHtml(mode, content) {
    return '<table class="rep-shell">' +
      '<thead><tr><td>' + headerHtml(mode) + '</td></tr></thead>' +
      '<tbody><tr><td>' + content + '</td></tr></tbody>' +
      '<tfoot><tr><td></td></tr></tfoot>' +
    '</table>' + footerHtml();
  }

  /* ---------------- sections ---------------- */
function applicantHtml() {
    var s = App.state, c = App.computed;
    var basis = s.customer.type === 'BIZMAN' ? 'Business (ITR)'
      : (s.income.normalMode === 'EPF' ? 'EPF / KWSP statement' : 'Salary / Payslip');
    var v2 = App.customerDetailsV2;
    return section('Applicant', dl([
      ['Name', dash(s.customer.name)],
      ['NRIC', dash(E.formatIC(s.customer.ic))],
      ['Age', c.age != null ? c.age + ' years' : '-'],
      ['Type', dash(s.customer.type)],
      ['Segment', dash(s.customer.segment)],
      ['Class', dash(s.customer.cardType)],
      ['iScore', dash(s.iScore)],
      ['Report Date', dash(s.reportDate)],
      ['Income Source', basis],
      ['Nature of Employment', dash(v2 && s.customer.natureOfEmployment
        ? (v2.natureLabel(s.customer.natureOfEmployment) || s.customer.natureOfEmployment) : '')],
      ['Number of Household', dash(v2 && s.customer.householdSize
        ? v2.householdLabel(s.customer.householdSize) : s.customer.householdSize)],
      ['Workplace Location', dash(v2 && s.customer.workplaceLocation
        ? (v2.workplaceLabel(s.customer.workplaceLocation) || s.customer.workplaceLocation) : '')]
    ], 3));
  }

  function incomeMonthsTableHtml() {
    var s = App.state, c = App.computed, inc = c.income;
    var months = s.income.manualMonths || [];
    var cols = [
      ['basic', 'Basic Income'], ['fixedAllowance', 'Fixed Allowance'],
      ['fixedAllowanceDesc', 'Fixed Allowance Desc'], ['other', 'Other Income'],
      ['commission', 'Commission Income'], ['ot', 'OT'],
      ['epf', 'EPF'], ['pcb', 'PCB / Zakat'], ['socso', 'SOCSO + EIS'],
      ['otherDeduction', 'Other Deductions']
    ];
    var head = cols.map(function (c2) { return c2[1]; });

    function monthHasData(m) {
      if (String((m && m.monthLabel) || '').trim() !== '') return true;
      return cols.some(function (c2) {
        var v = m ? m[c2[0]] : '';
        return String(v == null ? '' : v).replace(/[,\s%-]/g, '') !== '';
      });
    }
    var rows = months.map(function (m, i) { return { m: m, i: i }; })
      .filter(function (x) { return monthHasData(x.m); });
    var body = rows.map(function (x) {
      var m = x.m, i = x.i;
      return '<tr><td>' + esc(m.monthLabel || ('Month ' + (i + 1))) + '</td>' + cols.map(function (c2) {
        return c2[0] === 'fixedAllowanceDesc'
          ? '<td>' + esc(dash(m[c2[0]])) + '</td>'
          : '<td class="num">' + esc(num(m[c2[0]]) ? fmt(num(m[c2[0]])) : '-') + '</td>';
      }).join('') + '</tr>';
    }).join('');
    function colSum(key) {
      return rows.reduce(function (a, x) { return a + num(x.m[key]); }, 0);
    }
    var totalRow = '<tr class="rep-total"><td>Total</td>' + cols.map(function (c2) {
      return c2[0] === 'fixedAllowanceDesc' ? '<td></td>' : '<td class="num">' + fmt(colSum(c2[0])) + '</td>';
    }).join('') + '</tr>';

    var recognised = {
      basic: inc.basicRecog, fixedAllowance: inc.avgFixed, other: inc.avgOther,
      commission: inc.avgComm, ot: inc.avgOT,
      epf: inc.avgEPF, pcb: inc.avgPCB, socso: inc.avgSocso,
      otherDeduction: inc.avgOtherDeduction
    };
    var avgRow = '<tr class="rep-total"><td>Average</td>' + cols.map(function (c2) {
      return c2[0] === 'fixedAllowanceDesc' ? '<td></td>' : '<td class="num">' + fmt(recognised[c2[0]] || 0) + '</td>';
    }).join('') + '</tr>';
    return '<div class="rep-prod-h">Income for ' + esc(dash(s.customer.name)) + '</div>' +
      '<div class="rep-tbl-wrap"><table class="rep-tbl"><thead><tr><th></th>' +
      head.map(function (h) { return '<th class="num">' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + body + totalRow + avgRow + '</tbody></table></div>';
  }

  function incomeBuildupHtml() {
    var c = App.computed, inc = c.income;
    return dl([
      ['(+) Basic + Fixed Allowance', fmt(inc.basicRecog + inc.avgFixed)],
      ['(+) Other Income', fmt(inc.avgOther)],
      ['(+) Commission (60%)', fmt(inc.average60Comm)],
      ['(+) OT', fmt(inc.avgOT)],
      ['(=) Gross Income', fmt(c.grossIncome)],
      ['(-) EPF + PCB/Zakat', fmt(inc.average60EPF + inc.avgPCB)],
      ['(-) SOCSO + EIS', fmt(inc.avgSocso)],
      ['(-) Other deductions', fmt(inc.avgOtherDeduction || 0)],
      ['(=) Net Income', fmt(c.netIncome)]
    ], 2);
  }

  function incomeHtml() {
    var s = App.state, c = App.computed;
    var isManualNormal = s.customer.type !== 'BIZMAN' && s.income.normalMode !== 'EPF';

    var html = isManualNormal
      ? incomeMonthsTableHtml() + '<div style="margin-top:10px">' + incomeBuildupHtml() + '</div>'
      : figures([
          ['Gross Income', fmt(c.grossIncome), 'accent'],
          ['Net Income', fmt(c.netIncome), 'good']
        ]);
    return section('Income', html);
  }

  function ccrisTableHtml() {
    var s = App.state, c = App.computed;
    var dataRows = (s.ccris || []).filter(function (r) {
      return String(r.facility || '').trim() !== '';
    }).map(function (r, i) {
      var lc = E.lineCommitment(r, s.customer.cardType);
      var floating = String(r.floating || '').toUpperCase() === 'YES';
      var stress = E.stressCommitment(lc.commitment, floating, E.stressFactorFor(r));
      return { cells: [
        String(i + 1), dash(r.date), dash(r.capacity), dash(r.collateral), dash(r.facility),
        amt(num(r.outstanding)), amt(num(r.limit)), dash(r.legalStatus),
        r.override !== '' && r.override != null ? amt(num(r.override)) : '-',
        amt(lc.commitment), floating ? 'Yes' : 'No', amt(stress)
      ] };
    });
    if (!dataRows.length) return '<p class="rep-empty">No CCRIS records captured.</p>';
    var head = ['No', 'Date', 'Capacity', 'Collateral', 'Facility', 'Outstanding', 'Limit',
      'Legal Status', 'Override', 'Commitment', 'Floating Rate', 'Stress Test Commitment'];
    var th = head.map(function (h, i) { return '<th' + (i ? ' class="num"' : '') + '>' + esc(h) + '</th>'; }).join('');
    var body = dataRows.map(function (r) {
      return '<tr>' + r.cells.map(function (c2, i) {
        return '<td' + (i ? ' class="num"' : '') + '>' + esc(c2) + '</td>';
      }).join('') + '</tr>';
    }).join('');

    body += '<tr><td colspan="9">Deduct Balance Transfer Commitment</td>' +
      '<td class="num">(' + esc(amt(c.btTotal)) + ')</td><td colspan="2"></td></tr>';
    body += '<tr class="rep-total"><td colspan="9">TOTAL</td>' +
      '<td class="num">' + esc(amt(c.grandTotal)) + '</td><td></td>' +
      '<td class="num">' + esc(amt(c.stressTotal)) + '</td></tr>';
    return '<div class="rep-tbl-wrap"><table class="rep-tbl"><thead><tr>' + th + '</tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function balanceTransferHtml() {
    var s = App.state;
    var rows = (s.bt || []).filter(function (r) {
      return num(r.outstanding) > 0 || num(r.repayment) > 0;
    }).map(function (r, i) {
    var repayment = r.type === 'BT' ? E.btRepayment(num(r.outstanding)) : num(r.repayment);
    return { cells: [String(i + 1),
      amt(num(r.outstanding)),
      amt(repayment)] };
    });
    if (!rows.length) return '';
    return '<div class="rep-tbl-wrap" style="margin-top:10px">' +
      '<div class="rep-prod-h">Balance Transfer</div>' +
      tableRows(['No', 'Amount', 'Minimum Payment'], rows) + '</div>';
  }

  function commitmentsHtml() {

    return section('Commitments', ccrisTableHtml() + balanceTransferHtml());
  }

  /* ---------------- per-product decision blocks ---------------- */

  function pfBlock(res, heading, amount, tenure) {
    return '<div class="rep-prod">' +
      '<div class="rep-prod-h">' + esc(heading) + '</div>' +
      dl([
        ['Amount', fmt(num(amount))],
        ['Tenure', num(tenure) ? num(tenure) + ' months' : '-'],
        ['Profit Rate', res.rateFrac != null ? pct(res.rateFrac, 2) : '-'],
        ['Instalment', fmt(res.instalment)],
        ['PF Aggregated (no BT)', fmt(res.pfAggregate.totalPF)]
      ], 3) + '</div>';
  }
  function hfBlock(res) {
    var h = App.state.hf;
    return '<div class="rep-prod">' +
      '<div class="rep-prod-h">Home Financing - ' + esc(h.product) + '</div>' +
      dl([
        ['Financing', fmt(res.totalFinancing)],
        ['Effective Rate', pct(res.effectiveRate, 2)],
        ['Instalment', fmt(res.instalment)]
      ], 3) + '</div>';
  }
  function ccBlock(res, heading) {
    return '<div class="rep-prod">' +
      '<div class="rep-prod-h">' + esc(heading) + '</div>' +
      dl([
        ['Approved Limit', fmt(res.active.maxCreditLimit)],
        ['Instalment (1%)', fmt(res.active.monthlyInstallment)]
      ], 3) + '</div>';
  }

  function pfFinancingDetailHtml(r) {
    return '<div class="rep-prod">' +
      '<div class="rep-prod-h">Financing</div>' +
      dl([
        ['Current DSR', pct(r.currentDSR, DP)],
        ['Existing Commitment', fmt(App.computed.grandTotal)],
        ['Financing Requested', fmt(num(App.state.pf.amount))],
        ['Tenure (Month)', num(App.state.pf.tenureMonths) || '-'],
        ['Profit Rate', r.rateFrac != null ? pct(r.rateFrac, 2) : '-'],
        ['Instalment', fmt(r.instalment)],
        ['New Commitment', fmt(r.newCommitment)],
        ['Net Disposable Income (NDI)', fmt(r.ndi)],
        ['New DSR', pct(r.newDSR, DP)],
        ['Net Income with Assumed Increment (v2)', fmt(r.assumedNetIncome)],
        ['Revised Stress NDI (v2)', fmt(r.stressNdiV2)],
        ['Existing PF (no BT)', fmt(r.pfAggregate.existingPF)],
        ['New PF (this application)', fmt(r.pfAggregate.newPF)],
        ['PF Aggregated (no BT)', fmt(r.pfAggregate.totalPF)],
        ['Stress Test Combined Instalment', fmt(r.stressCommit)],
        ['Stress Net Disposable Income (Stress NDI)', fmt(r.stressNdi)],
        ['Stress Test DSR (%)', pct(r.stressDSR, DP)],
        ['New Commitment Unsecured', fmt(r.unsecCommit)],
        ['New DSR Unsecured (%)', pct(r.unsecDSR, DP)]
      ], 2) + '</div>';
  }

  function productsHtml(mode) {
    var s = App.state;
    var blocks = '';

    if (mode.indexOf('pf') !== -1) {
      if (mode === 'pf-hf' && (s.pf.apps || []).length) {
        (s.pf.apps || []).forEach(function (a) {
          blocks += pfBlock(App.computePFApp(a),
            'Personal Financing - ' + applicantLabel(a.applicant), a.amount, a.tenureMonths);
        });
      } else if (mode !== 'pf-hf') {
        blocks += pfFinancingDetailHtml(App.computePF());
      }
    }

    if (mode.indexOf('hf') !== -1) {
      blocks += hfBlock(App.computeHF());
    }

    if (mode.indexOf('cc') !== -1) {
      if (mode === 'hf-cc' && (s.cc.cards || []).length) {
        (s.cc.cards || []).forEach(function (card) {
          var r = App.computeCCCard(card);
          blocks += ccBlock(r, 'Credit Card - ' + applicantLabel(card.applicant), r);
        });
      } else if (mode !== 'hf-cc') {
        var cc = App.computeCC();
        blocks += ccBlock(cc, 'Credit Card - ' + productName(s.cc.product), cc.afterBT);
      }
    }
    return section('Facilities', blocks || '<p class="rep-empty">No facility details captured.</p>');
  }

  function applicantLabel(key) {
    if (key === 'MAIN') return 'Main Applicant';
    return 'Joint Applicant ' + key;
  }
  function productName(p) {
    return String(p || '').replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  /* ---------------- final decision ---------------- */
  function decPill(verdict, prods) {
    var label = E.verdictLabel(verdict);
    var cls = E.verdictClass(verdict) || 'warn';
    if (!label) label = 'PENDING';
    return '<span class="rep-pill ' + cls + '">' +
      esc(label + (prods && prods.length ? ' ' + prods.join(' + ') : '')) + '</span>';
  }
  function decPillOk(ok, prods) {
    return '<span class="rep-pill ' + (ok ? 'ok' : 'fail') + '">' +
      esc((ok ? 'APPROVED' : 'REJECTED') + (prods && prods.length ? ' ' + prods.join(' + ') : '')) + '</span>';
  }

  /* ---------------- decision ---------------- */
function decisionHtml(mode) {
    if (!App.combinedDecisionData) return '';
    var d = App.combinedDecisionData(mode);
    if (!d) return '';

    if (d.kind === 'per-applicant') {
      var body = d.rows.map(function (r) {
        var build = r.build.map(function (b) { return b[0] + ' ' + fmt(b[1]); });
        if (r.existing) build.push('existing ' + fmt(r.existing));
        return '<tr>' +
          '<td><b>' + esc(r.name) + '</b><br><span class="rep-dec-build">' + esc(build.join(' + ')) + '</span></td>' +
          '<td class="num">' + fmt(r.commit) + '</td>' +
          '<td class="num">' + fmt(r.net) + '</td>' +
          '<td class="num">' + pct(r.dsr, DP) + '</td>' +
          '<td>' + decPillOk(r.ok, r.labelProds || r.prods) + '</td></tr>';
      }).join('');
      var tbl = '<table class="rep-tbl rep-dec-tbl"><thead><tr>' +
        '<th>Applicant</th><th class="num">New Commitment</th><th class="num">Personal Net</th>' +
        '<th class="num">DSR</th><th>Decision</th></tr></thead><tbody>' + body + '</tbody></table>';
      return section('Combined Decision',
        '<div class="rep-dec-note">Home instalment ' + fmt(d.hfInst) + ' split &divide; ' + d.N + '</div>' + tbl);
    }

    var extra = d.multi ? ('<div class="rep-dec-parts">' + d.parts.map(function (p) {
      return esc(p.label) + ': ' + (E.verdictLabel(p.verdict) || '-');
    }).join('  &middot;  ') + '</div>') : '';
    var finalLine = '<div class="rep-dec-final"><span>New DSR ' + pct(d.dsr, DP) + '</span>' +
      decPill(d.verdict, d.labelProds || d.prods) + '</div>';
    return section(d.multi ? 'Combined Decision' : 'Application Summary', extra + finalLine);
  }

  /* ---------------- build ---------------- */
App.buildPrintReport = function () {
    var host = document.getElementById('print-report');
    if (!host) return;
    App.computeShared();
    var mode = App.mode;
    var body;
    if (!App.computed.intakeReady) {
      body = '<p class="rep-empty">Complete the applicant, Experian and income intake ' +
        'before exporting the evaluation report.</p>';
      host.innerHTML = shellHtml(mode, section('Status', body));
      return;
    }
    host.innerHTML = shellHtml(mode,
      applicantHtml() +
      commitmentsHtml() +
      incomeHtml() +
      productsHtml(mode) +
      decisionHtml(mode));
  };

  App.printReport = function () {
    App.buildPrintReport();

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { window.print(); });
    });
  };
})();
