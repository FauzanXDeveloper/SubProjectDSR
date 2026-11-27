/* ---------------- credit card ---------------- */

(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;
  var fmt = App.mod.ui.fmt, fmtPct = App.mod.ui.fmtPct, DSR_DP = App.mod.ui.DSR_DP, num = App.mod.ui.num, esc = App.mod.ui.esc, el = App.mod.ui.el, vClass = App.mod.ui.vClass, vLabel = App.mod.ui.vLabel, tile = App.mod.ui.tile, gauge = App.mod.ui.gauge, field = App.mod.ui.field, bindNum = App.mod.ui.bindNum, cardShell = App.mod.ui.cardShell;
  var applicantPersonalIncome = App.mod.applicants.applicantPersonalIncome, applicantIScore = App.mod.applicants.applicantIScore, applicantExisting = App.mod.applicants.applicantExisting, applicantName = App.mod.applicants.applicantName, hfApplicantList = App.mod.applicants.hfApplicantList;

  function cardImagesHtml(product) {
    var imgs = product === 'BOTH'
      ? [['visa_platinum_cc.svg', 'Visa Platinum'], ['visa_signature_cc.svg', 'Visa Signature']]
      : product === 'VISA_SIGNATURE'
        ? [['visa_signature_cc.svg', 'Visa Signature']]
        : [['visa_platinum_cc.svg', 'Visa Platinum']];
    return '<div class="cc-cards' + (imgs.length > 1 ? ' both' : '') + '">' +
      imgs.map(function (c) {
        return '<div class="cc-card"><img src="public/' + c[0] + '" alt="' + c[1] +
          ' credit card"><div class="cc-card-name">' + c[1] + '</div></div>';
      }).join('') + '</div>';
  }
  function ccProductOptions(sel) {
    return [['VISA_PLATINUM', 'Visa Platinum'], ['VISA_SIGNATURE', 'Visa Signature'],
            ['BOTH', 'Both (Platinum + Signature)']]
      .map(function (o) { return '<option value="' + o[0] + '"' + (sel === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
  }

  App.renderCC = function () {
    var cc = App.state.cc;

    if (App.mode === 'hf-cc') {
      ensureCardSeed();
      var appList = hfApplicantList();
      var listHtml = cc.cards.map(function (card, i) {
        var usedByOthers = {};
        cc.cards.forEach(function (c2, j) { if (j !== i) usedByOthers[c2.applicant] = true; });
        var opts = appList.filter(function (a) { return a.key === card.applicant || !usedByOthers[a.key]; })
          .map(function (a) {
            return '<option value="' + a.key + '"' + (a.key === card.applicant ? ' selected' : '') + '>' +
              esc(a.name) + (a.key === 'MAIN' ? ' (Main)' : ' (Joint ' + a.key + ')') + '</option>';
          }).join('');
        return '<div class="cc-app" data-ci="' + i + '">' +
          '<div class="cc-app-head">' +
          '<div class="field"><label>Applicant</label><select class="editable" data-cf="applicant">' + opts + '</select></div>' +
          '<div class="field"><label>Card Product</label><select class="editable" data-cf="product">' + ccProductOptions(card.product) + '</select></div>' +
          (cc.cards.length > 1 ? '<button class="row-del" data-cdel="' + i + '" title="Remove application" type="button">&times;</button>' : '') +
          '</div>' +
          cardImagesHtml(card.product) +
          '<div class="grid c2">' +
          '<div class="field"><label>Proposed Limit (RM, optional)</label><input class="editable" data-cf="proposedLimit" type="text" inputmode="decimal" data-fmt="money" value="' + esc(card.proposedLimit) + '"></div>' +
          '<div class="field"><label>Figures Shown</label><select class="editable" data-cf="useProposed">' +
          '<option value="0"' + (!card.useProposed ? ' selected' : '') + '>Original (system-calculated)</option>' +
          '<option value="1"' + (card.useProposed ? ' selected' : '') + '>Proposed limit</option></select></div>' +
          '</div>' +
          '<div id="cc-out-' + i + '"></div>' +
          '</div>';
      }).join('');
      var canAdd = App.availableCardApplicants().length > 0;
      var body = '<div class="cc-list">' + listHtml + '</div>' +
        (canAdd ? '<div style="margin-top:12px"><button class="btn small secondary" id="cc-addcard" type="button">+ Add credit card application</button></div>' : '');
      el('panel-cc').innerHTML = cardShell('card-cc', 'Credit Cards - Limit &amp; DSR (per applicant)', body);
      bindCCList();
      return;
    }

    var body =
      cardImagesHtml(cc.product) +
      '<div class="grid c2">' +
      field('Proposed Limit (RM, optional override)', 'cc-proposed', cc.proposedLimit) +
      '<div class="field"><label>Figures Shown</label><select class="editable" id="cc-useproposed">' +
      '<option value="0"' + (!cc.useProposed ? ' selected' : '') + '>Original (system-calculated)</option>' +
      '<option value="1"' + (cc.useProposed ? ' selected' : '') + '>Proposed limit</option></select></div>' +
      '</div>' +
      '<div id="cc-out"></div>';
    el('panel-cc').innerHTML = cardShell('card-cc', 'Credit Card - Limit &amp; DSR Evaluation', body);
    bindNum('cc-proposed', cc, 'proposedLimit');
    var up = el('cc-useproposed');
    if (up) up.onchange = function () { App.state.cc.useProposed = this.value === '1'; App.refreshOutputs(); };
  };

  function bindCCList() {
    var panel = el('panel-cc');
    if (!panel) return;
    if (!panel._ccListBound) {
      panel._ccListBound = true;
      panel.addEventListener('input', function (ev) {
        var t = ev.target, box = t.closest ? t.closest('.cc-app') : null;
        if (!box || t.dataset.cf == null) return;
        var card = App.state.cc.cards[+box.dataset.ci];
        if (!card) return;
        var f = t.dataset.cf;
        if (f === 'useProposed') card.useProposed = t.value === '1';
        else card[f] = f === 'product' ? t.value : t.value;
        if (f === 'applicant' || f === 'product') { App.renderCC(); }
        App.refreshOutputs();
      });
      panel.addEventListener('click', function (ev) {
        var t = ev.target;
        if (t.id === 'cc-addcard') {
          var avail = App.availableCardApplicants();
          if (avail.length) {
            App.state.cc.cards.push({ applicant: avail[0].key, product: 'VISA_PLATINUM', proposedLimit: '', useProposed: false });
            App.renderCC(); App.refreshOutputs();
          }
          return;
        }
        if (t.dataset && t.dataset.cdel != null) {
          App.state.cc.cards.splice(+t.dataset.cdel, 1);
          App.renderCC(); App.refreshOutputs();
        }
      });
    }
  }

  App.computeCC = function () {
    var s = App.state, c = App.computed;
    var original = E.calculateMaxCreditLimit(c.grossIncome, s.iScore, s.cc.product);
    var active = original;
    if (s.cc.useProposed && num(s.cc.proposedLimit) > 0) {
      active = E.evaluateProposedLimit(s.cc.proposedLimit, s.cc.product);
      active.multiplier = original.multiplier;
    }
    var threshold = E.ccDsrThreshold(c.grossIncome) / 100;

    /* ---------------- scoring ---------------- */
function evaluate(baseCommitment) {
      var newCommitment = baseCommitment + active.monthlyInstallment;
      var dsr = c.netIncome > 0 ? newCommitment / c.netIncome : 0;
      return {
        newCommitment: newCommitment, dsr: dsr,
        ndi: c.netIncome - newCommitment,
        eligible: active.isEligibleByLimit && dsr > 0 && dsr <= threshold && c.netIncome > 0
      };
    }
    var afterBT = evaluate(c.grandTotal);
    var beforeBT = evaluate(c.totalCommitment);

    return {
      original: original, active: active, threshold: threshold,
      afterBT: afterBT, beforeBT: beforeBT,
      verdict: afterBT.eligible ? E.VERDICT.ELIGIBLE : E.VERDICT.NOT_ELIGIBLE
    };
  };

  App.computeCCCard = function (card) {
    var pers = applicantPersonalIncome(card.applicant);
    var iScore = applicantIScore(card.applicant);
    var original = E.calculateMaxCreditLimit(pers.gross, iScore, card.product);
    var active = original;
    if (card.useProposed && num(card.proposedLimit) > 0) {
      active = E.evaluateProposedLimit(card.proposedLimit, card.product);
      active.multiplier = original.multiplier;
    }
    var threshold = E.ccDsrThreshold(pers.gross) / 100;
    var existing = applicantExisting(card.applicant);
    var newCommitment = existing + active.monthlyInstallment;
    var dsr = pers.net > 0 ? newCommitment / pers.net : 0;
    return {
      card: card, applicant: card.applicant, name: applicantName(card.applicant),
      personal: pers, iScore: iScore, original: original, active: active,
      threshold: threshold, existing: existing, newCommitment: newCommitment,
      dsr: dsr, ndi: pers.net - newCommitment,
      eligible: active.isEligibleByLimit && dsr > 0 && dsr <= threshold && pers.net > 0,
      verdict: (active.isEligibleByLimit && dsr > 0 && dsr <= threshold && pers.net > 0)
        ? E.VERDICT.ELIGIBLE : E.VERDICT.NOT_ELIGIBLE
    };
  };

  App.availableCardApplicants = function () {
    var used = {};
    (App.state.cc.cards || []).forEach(function (c) { used[c.applicant] = true; });
    return hfApplicantList().filter(function (a) { return !used[a.key]; });
  };

  function ensureCardSeed() {
    var cc = App.state.cc;
    if (!cc.cards) cc.cards = [];
    if (!cc.cards.length) {
      cc.cards.push({ applicant: 'MAIN', product: cc.product || 'VISA_PLATINUM',
        proposedLimit: cc.proposedLimit || '', useProposed: !!cc.useProposed });
    }

    var valid = {}; hfApplicantList().forEach(function (a) { valid[a.key] = true; });
    cc.cards = cc.cards.filter(function (c) { return valid[c.applicant]; });
    if (!cc.cards.length) cc.cards.push({ applicant: 'MAIN', product: 'VISA_PLATINUM', proposedLimit: '', useProposed: false });
  }

  /* ---------------- card result ---------------- */
function ccCardResultHtml(rc) {
    var a = rc.active;
    var rg = E.cardRiskGrade(rc.iScore);
    var rgLabel = rg ? rg
      : (rc.iScore ? 'Below RG5' : '-');
    return '<div class="subhead">' + esc(rc.name) + ' - result' + (rc.card && rc.card.useProposed ? ' (proposed limit)' : '') + '</div>' +
      '<p><span class="verdict ' + vClass(rc.verdict) + '">' + vLabel(rc.verdict) + '</span>&nbsp;&nbsp;' +
      '<span class="verdict ' + (rc.dsr <= rc.threshold && rc.dsr > 0 ? 'ok' : 'fail') + '">DSR ' + fmtPct(rc.dsr, DSR_DP) + '</span></p>' +
      gauge(rc.dsr, rc.threshold) +
      '<div class="tile-grid" style="margin-top:10px">' +
      tile('Credit Card Risk Grade', rgLabel, 'accent') +
      tile('Personal Gross', fmt(rc.personal.gross)) +
      tile('Max Credit Limit', fmt(a.maxCreditLimit), 'accent') +
      tile('Card Instalment (1%)', fmt(a.monthlyInstallment)) +
      tile('Existing Commitment', fmt(rc.existing)) +
      tile('New DSR', fmtPct(rc.dsr, DSR_DP)) +
      tile('NDI', fmt(rc.ndi), rc.ndi > 0 ? 'good' : 'accent') +
      '</div>';
  }

  App.refreshCC = function () {

    if (App.mode === 'hf-cc') {
      (App.state.cc.cards || []).forEach(function (card, i) {
        var cell = el('cc-out-' + i);
        if (cell) cell.innerHTML = ccCardResultHtml(App.computeCCCard(card));
      });
      return;
    }
    var out = el('cc-out');
    if (!out) return;
    var r = App.computeCC();
    var a = r.active;

    var cardRG = E.cardRiskGrade(App.state.iScore);
    var rgLabel = cardRG
      ? cardRG
      : (App.state.iScore ? 'Below RG5' : '-');
    out.innerHTML =
      '<div class="result-card">' +
      '<div class="rc-head"><span class="rc-title">Result' + (App.state.cc.useProposed ? ' (proposed limit)' : '') + '</span>' +

      '<span>' + (App.mode === 'cc' ? '' : '<span class="verdict ' + vClass(r.verdict) + '">' + vLabel(r.verdict) + '</span>&nbsp;&nbsp;') +
      '<span class="verdict ' + (r.afterBT.dsr <= r.threshold && r.afterBT.dsr > 0 ? 'ok' : 'fail') +
      '">DSR ' + fmtPct(r.afterBT.dsr, DSR_DP) + '</span></span></div>' +
      gauge(r.afterBT.dsr, r.threshold) +
      '<div class="tile-grid" style="margin-top:10px">' +
      tile('Credit Card Risk Grade', rgLabel, 'accent') +
      tile('Max Credit Limit', fmt(a.maxCreditLimit), 'accent') +
      tile('Card Monthly Instalment (1%)', fmt(a.monthlyInstallment)) +
      '</div></div>' +
      '<div class="result-card">' +
      '<div class="rc-head"><span class="rc-title">Before vs After Balance Transfer</span></div>' +
      '<div class="tile-grid">' +
      tile('New Commitment (before BT)', fmt(r.beforeBT.newCommitment)) +
      tile('New DSR (before BT)', fmtPct(r.beforeBT.dsr, DSR_DP)) +
      tile('NDI (before BT)', fmt(r.beforeBT.ndi)) +
      tile('New Commitment (after BT)', fmt(r.afterBT.newCommitment)) +
      tile('New DSR (after BT)', fmtPct(r.afterBT.dsr, DSR_DP)) +
      tile('NDI (after BT)', fmt(r.afterBT.ndi), r.afterBT.ndi > 0 ? 'good' : 'accent') +
      '</div></div>';
  };

  App.registerProduct({
    id: 'cc', label: 'Credit Card (CC)', name: 'Credit Card', short: 'CC',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h5"/></svg>',
    panel: 'panel-cc', render: 'renderCC', refresh: 'refreshCC', seed: 'seedCC'
  });
  App.seedCC = ensureCardSeed;
  App.mod = App.mod || {};
  App.mod.cc = { cardImagesHtml: cardImagesHtml, ccProductOptions: ccProductOptions, bindCCList: bindCCList, ensureCardSeed: ensureCardSeed, ccCardResultHtml: ccCardResultHtml };
})();
