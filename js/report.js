/* ============================================================
   report.js - a dedicated, compact print / PDF report.

   Replaces the old "print the whole page" snapshot with a
   curated evaluation sheet that fits A4: applicant, income,
   existing commitments, the requested product(s) and the DSR
   decision, plus the maker / checker sign-off. Built fresh on
   every print from App.state + the same compute functions the
   on-screen panels use, so the numbers can never drift.
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;
  var fmt = E.formatCurrency;
  var pct = E.formatPct;
  var DP = 2;   // DSR readings to 2 dp, matching the panels

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isFinite(n) ? n : 0; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function dash(v) { return (v === '' || v == null) ? '-' : v; }

  var MODE_LABEL = {
    pf: 'Personal Financing (PF)',
    hf: 'Home Financing (HF)',
    cc: 'Credit Card (CC)',
    'pf-cc': 'Personal Financing + Credit Card',
    'hf-cc': 'Home Financing + Credit Card',
    'pf-hf': 'Personal Financing + Home Financing'
  };

  // Officer-facing decision is two-state (APPROVED / REJECTED); the engine's
  // internal Excel-parity verdicts feed the label + colour via the engine.
  function pill(v) {
    var label = E.verdictLabel(v);
    if (!label) return '-';
    return '<span class="rep-pill ' + E.verdictClass(v) + '">' + esc(label) + '</span>';
  }

  /* ---- small layout helpers ---- */
  function section(title, inner) {
    return '<section class="rep-sec"><h2 class="rep-h2">' + esc(title) + '</h2>' + inner + '</section>';
  }
  /** definition grid: pairs = [[label, value], ...] */
  function dl(pairs, cols) {
    var cells = pairs.map(function (p) {
      return '<div class="rep-dl-item"><dt>' + esc(p[0]) + '</dt><dd>' + (p[2] ? p[1] : esc(p[1])) + '</dd></div>';
    }).join('');
    return '<dl class="rep-dl c' + (cols || 3) + '">' + cells + '</dl>';
  }
  /** key figure tiles: items = [[label, value, cls], ...] */
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

  /* ============================================================
     SECTIONS
     ============================================================ */
  function headerHtml(mode) {
    var s = App.state;
    var printed = new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' });
    return '<header class="rep-head">' +
      '<img class="rep-logo" src="public/alrajhi_logo.png" alt="Al Rajhi Bank Malaysia">' +
      '<div class="rep-head-txt">' +
      '<div class="rep-title">Financing &amp; DSR Evaluation Report</div>' +
      '<div class="rep-sub">' + '   ' + esc(MODE_LABEL[mode] || mode) + '</div>' +
      '</div>' +
      '<div class="rep-head-meta">' +
      '<div><span>Applicant</span>' + esc(s.customer.name || '-') + '</div>' +
      '<div><span>Printed</span>' + esc(printed) + '</div>' +
      '</div></header>';
  }

  function applicantHtml() {
    var s = App.state, c = App.computed;
    var basis = s.customer.type === 'BIZMAN' ? 'Business (ITR)'
      : (s.income.normalMode === 'EPF' ? 'EPF / KWSP statement' : 'Salary / Payslip');
    return section('Applicant', dl([
      ['Name', dash(s.customer.name)],
      ['NRIC', dash(E.formatIC(s.customer.ic))],
      ['Age', c.age != null ? c.age + ' years' : '-'],
      ['Type', dash(s.customer.type)],
      ['Segment', dash(s.customer.segment)],
      ['Class', dash(s.customer.cardType)],
      ['iScore', dash(s.iScore)],
      ['Report Date', dash(s.reportDate)],
      ['Income Source', basis]
    ], 3));
  }

  function incomeHtml() {
    var c = App.computed;
    return section('Income', figures([
      ['Gross Income', fmt(c.grossIncome), 'accent'],
      ['Net Income', fmt(c.netIncome), 'good']
    ]));
  }

  function commitmentsHtml(mode) {
    var s = App.state, c = App.computed;
    var newInst = totalNewInstalment(mode);
    var inclNew = (c.grandTotal || 0) + newInst;            // existing + our new facility
    var ndiAfter = (c.netIncome || 0) - inclNew;
    var html = figures([
      ['Net Existing', fmt(c.grandTotal), 'accent'],
      ['Total + New', fmt(inclNew), 'accent'],
      ['NDI (After New)', fmt(ndiAfter), ndiAfter > 0 ? 'good' : 'accent']
    ]);
    // compact CCRIS listing (decision-relevant lines only)
    var rows = (s.ccris || []).filter(function (r) {
      return String(r.facility || '').trim() !== '';
    }).map(function (r, i) {
      var lc = E.lineCommitment(r, s.customer.cardType);
      return { cells: [String(i + 1) + '. ' + (r.facility || '-'),
        fmt(num(r.outstanding)), fmt(num(r.limit)), fmt(lc.commitment)] };
    });
    if (rows.length) {
      rows.push({ _total: true, cells: ['Total', '', '', fmt(c.totalCommitment)] });
      html += '<div class="rep-tbl-wrap">' +
        tableRows(['CCRIS Facility', 'Outstanding (RM)', 'Limit (RM)', 'Monthly (RM)'], rows) + '</div>';
    }
    return section('Commitments', html);
  }

  /** Sum of the monthly instalments for every facility requested in this mode,
      used for the "existing + new" and NDI-after figures. */
  function totalNewInstalment(mode) {
    var s = App.state, tot = 0;
    if (mode.indexOf('pf') !== -1) {
      if (mode === 'pf-hf' && (s.pf.apps || []).length) {
        (s.pf.apps || []).forEach(function (a) { tot += App.computePFApp(a).instalment; });
      } else if (mode !== 'pf-hf') { tot += App.computePF().instalment; }
    }
    if (mode.indexOf('hf') !== -1) {
      var hf = App.computeHF();
      tot += hf.ctf !== 0 ? hf.ctf : hf.instalment;
    }
    if (mode.indexOf('cc') !== -1) {
      if (mode === 'hf-cc' && (s.cc.cards || []).length) {
        (s.cc.cards || []).forEach(function (card) { tot += App.computeCCCard(card).active.monthlyInstallment; });
      } else if (mode !== 'hf-cc') { tot += App.computeCC().active.monthlyInstallment; }
    }
    return tot;
  }

  /* ---- per-product decision blocks ---- */
  // Product blocks show only the facility's own working (amount, rate,
  // instalment). The commitment/DSR/NDI/verdict live once, in Commitments +
  // Decision, so nothing is repeated across sections.
  function pfBlock(res, heading, amount, tenure) {
    return '<div class="rep-prod">' +
      '<div class="rep-prod-h">' + esc(heading) + '</div>' +
      dl([
        ['Amount', fmt(num(amount))],
        ['Tenure', num(tenure) ? num(tenure) + ' months' : '-'],
        ['Profit Rate', res.rateFrac != null ? pct(res.rateFrac, 2) : '-'],
        ['Instalment', fmt(res.instalment)]
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

  function productsHtml(mode) {
    var s = App.state;
    var blocks = '';

    // PF: single (pf, pf-cc) vs one-per-applicant (pf-hf)
    if (mode.indexOf('pf') !== -1) {
      if (mode === 'pf-hf' && (s.pf.apps || []).length) {
        (s.pf.apps || []).forEach(function (a) {
          blocks += pfBlock(App.computePFApp(a),
            'Personal Financing - ' + applicantLabel(a.applicant), a.amount, a.tenureMonths);
        });
      } else if (mode !== 'pf-hf') {
        blocks += pfBlock(App.computePF(), 'Personal Financing', s.pf.amount, s.pf.tenureMonths);
      }
    }
    // HF
    if (mode.indexOf('hf') !== -1) {
      blocks += hfBlock(App.computeHF());
    }
    // CC: single (cc, pf-cc) vs one-per-applicant (hf-cc)
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

  /* ---- final decision: arranged from the shared decision model, so the PDF
     mirrors the on-screen banner without cloning its markup ---- */
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
          '<td>' + decPillOk(r.ok, r.prods) + '</td></tr>';
      }).join('');
      var tbl = '<table class="rep-tbl rep-dec-tbl"><thead><tr>' +
        '<th>Applicant</th><th class="num">New Commitment</th><th class="num">Personal Net</th>' +
        '<th class="num">DSR</th><th>Decision</th></tr></thead><tbody>' + body + '</tbody></table>';
      return section('Combined Decision',
        '<div class="rep-dec-note">Home instalment ' + fmt(d.hfInst) + ' split &divide; ' + d.N + '</div>' + tbl);
    }

    // single: the commitment/NDI figures live in Commitments and the
    // instalments in Facilities, so the decision only adds the per-product
    // verdict (combos) and the governing New DSR + overall decision.
    var extra = d.multi ? ('<div class="rep-dec-parts">' + d.parts.map(function (p) {
      return esc(p.label) + ': ' + (E.verdictLabel(p.verdict) || '-');
    }).join('  &middot;  ') + '</div>') : '';
    var finalLine = '<div class="rep-dec-final"><span>New DSR ' + pct(d.dsr, DP) + '</span>' +
      decPill(d.verdict, d.prods) + '</div>';
    return section(d.multi ? 'Combined Decision' : 'Application Summary', extra + finalLine);
  }

  function signoffHtml() {
    var g = App.state.signoff;
    function box(role, name, id, date, sig) {
      var sigImg = sig ? '<img class="rep-sig-img" src="' + esc(sig) + '" alt="signature">'
        : '<div class="rep-sig-blank"></div>';
      return '<div class="rep-sig">' +
        '<div class="rep-sig-role">' + esc(role) + '</div>' + sigImg +
        '<div class="rep-sig-line">' + esc(dash(name)) + '</div>' +
        '<div class="rep-sig-meta">Staff ID: ' + esc(dash(id)) + '&nbsp;&nbsp;&middot;&nbsp;&nbsp;Date: ' + esc(dash(date)) + '</div>' +
        '</div>';
    }
    return section('Sign-off',
      '<div class="rep-sigs">' +
      box('Maker', g.makerName, g.makerId, g.makerDate, g.makerSignature) +
      box('Checker', g.checkerName, g.checkerId, g.checkerDate, g.checkerSignature) +
      '</div>');
  }

  /* ============================================================
     BUILD + PRINT
     ============================================================ */
  App.buildPrintReport = function () {
    var host = document.getElementById('print-report');
    if (!host) return;
    App.computeShared();                 // make sure App.computed is current
    var mode = App.mode;
    var body;
    if (!App.computed.intakeReady) {
      body = '<p class="rep-empty">Complete the applicant, Experian and income intake ' +
        'before exporting the evaluation report.</p>';
      host.innerHTML = headerHtml(mode) + section('Status', body);
      return;
    }
    host.innerHTML =
      headerHtml(mode) +
      applicantHtml() +
      incomeHtml() +
      commitmentsHtml(mode) +
      productsHtml(mode) +
      decisionHtml(mode) +
      signoffHtml() +
      '<footer class="rep-foot">' +
      'Copyright &copy; ' + new Date().getFullYear() + ' Al Rajhi Banking &amp; Investment Corporation (Malaysia) Bhd<br>' +
      'Built by Retail Credit Risk (RCR) since July 2026<br>' +
      'For internal credit evaluation use only.' +
    '</footer>';
  };

  App.printReport = function () {
    App.buildPrintReport();
    // let the DOM paint the freshly built report before the print dialog opens
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { window.print(); });
    });
  };
})();
