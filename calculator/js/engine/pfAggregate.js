/* ---------------- PF aggregate (without BT) ---------------- */

/*
  PF Aggregated = existing PF commitments from CCRIS + the new PF instalment,
  measured WITHOUT the balance-transfer / settlement netting.

  Normal DSR uses grandTotal (CCRIS total minus BT repayments). This metric
  deliberately ignores that netting so the underwriter can see the gross PF
  exposure: for any CCRIS row linked to a BT record we use the override the
  row had before the BT was applied (bt.link.prevOverride), or recompute the
  line when no previous override existed.

  Which facility codes count as "PF" is policy and lives in
  Engine.CONFIG.pf.aggregate.facilities.
*/

(function () {
  'use strict';
  window.Engine = window.Engine || {};
  var Engine = window.Engine;

  var DEFAULT_FACILITIES = ['PELNFNCE', 'PELNFNSA'];

  function num(value) {
    var n = parseFloat(String(value == null ? '' : value).replace(/[,\s%]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function facilityList() {
    var configured = window.Engine.CONFIG &&
      window.Engine.CONFIG.pf &&
      window.Engine.CONFIG.pf.aggregate &&
      window.Engine.CONFIG.pf.aggregate.facilities;
    return (configured && configured.length ? configured : DEFAULT_FACILITIES)
      .map(function (code) { return String(code).toUpperCase().trim(); });
  }

  function isPfFacility(code) {
    var value = String(code == null ? '' : code).toUpperCase().trim();
    return value !== '' && facilityList().indexOf(value) !== -1;
  }

  function sameLine(row, link) {
    if (!row || !link) return false;
    if (String(row.facility || '').toUpperCase().trim() !==
        String(link.facility || '').toUpperCase().trim()) return false;
    if (String(row.date || '') !== String(link.date || '')) return false;
    return true;
  }

  /* Map ccris index -> the override the row had before BT mirrored it. */
  function preBtOverrides(rows, btList) {
    var byIndex = {};
    (btList || []).forEach(function (bt) {
      if (!bt || !bt.link || bt.link.i == null) return;
      var index = bt.link.i;
      var row = (rows || [])[index];
      if (!sameLine(row, bt.link)) return;
      byIndex[index] = {
        hasPrev: bt.link.prevOverride != null && String(bt.link.prevOverride).trim() !== '',
        prevOverride: bt.link.prevOverride == null ? '' : bt.link.prevOverride
      };
    });
    return byIndex;
  }

  function commitmentWithoutBt(row, cardType, linked) {
    if (!linked) return window.Engine.lineCommitment(row, cardType).commitment;
    if (linked.hasPrev) return Math.abs(num(linked.prevOverride));

    var copy = {};
    Object.keys(row || {}).forEach(function (k) { copy[k] = row[k]; });
    copy.override = '';
    return window.Engine.lineCommitment(copy, cardType).commitment;
  }

  /*
    rows         : App.state.ccris
    btList       : App.state.bt
    cardType     : customer card type (affects card lines only)
    newInstalment: instalment of the PF being applied for
  */
  function compute(input) {
    input = input || {};
    var rows = input.rows || [];
    var linked = preBtOverrides(rows, input.btList || []);

    var existing = 0;
    var byFacility = {};
    var count = 0;

    rows.forEach(function (row, index) {
      if (!row) return;
      var code = String(row.facility || '').toUpperCase().trim();
      if (!isPfFacility(code)) return;

      var amount = commitmentWithoutBt(row, input.cardType, linked[index]);
      if (!(amount > 0)) return;

      existing += amount;
      byFacility[code] = (byFacility[code] || 0) + amount;
      count++;
    });

    var newInstalment = num(input.newInstalment);
    var perFacility = Object.keys(byFacility).sort().map(function (code) {
      return { code: code, amount: byFacility[code] };
    });

    return {
      facilities: facilityList(),
      rowCount: count,
      existingPF: existing,
      newPF: newInstalment,
      totalPF: existing + newInstalment,
      perFacility: perFacility
    };
  }

  Engine.pfAggregate = {
    facilities: facilityList,
    isPfFacility: isPfFacility,
    compute: compute
  };
})();
