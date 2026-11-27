/* ---------------- ccris line commitment ---------------- */

(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isFinite(n) ? n : 0; }
  function CFG() { return window.Engine.CONFIG.ccris; }

  function hasOverride(v) {
    return v != null && String(v).replace(/[,\s%]/g, '').trim() !== '';
  }
  Engine.hasOverride = hasOverride;

  function lineCommitment(row, cardType, variant) {
    var K = num(row.override);
    var G = Math.abs(num(row.outstanding));
    var H = Math.abs(num(row.limit));
    var J = Math.abs(num(row.commitmentPerCCRIS));
    var F = String(row.facility || '').toUpperCase().trim();
    var capacity = String(row.capacity || '').toUpperCase().trim();

    if (hasOverride(row.override)) return { commitment: Math.abs(K), overridden: true };

    if (F === 'CRDTCARD') {

      if (G === 0) return { commitment: 0, overridden: false };

      var cardRate = CFG().cardRatePct / 100, floor = CFG().cardFloor;
      var o = G * cardRate;
      if (o > 0 && o < floor && !(variant === 'HF' && cardType === 'TYPE B')) o = floor;
      var v = cardType === 'TYPE B' ? o : Math.max(o, H * cardRate);
      return { commitment: v, overridden: false };
    }

    var rate = Engine.facilityFactor(F);

    if (capacity === 'JOINT') {

      if (F.indexOf('HL') === 0 || F.indexOf('HS') === 0) {
        return { commitment: (rate * J) / 2, overridden: false };
      }
      return { commitment: J / 2, overridden: false };
    }

    if (Object.prototype.hasOwnProperty.call(Engine.OD_FACILITIES, F)) {
      return { commitment: H * rate, overridden: false };
    }
    if (rate === CFG().cardRatePct / 100 && F !== 'CRDTCARD') {

      var w = G * rate;
      if (w > 0 && w < CFG().cardFloor) w = CFG().cardFloor;
      return { commitment: w, overridden: false };
    }
    return { commitment: rate * J, overridden: false };
  }

  function stressCommitment(baseCommitment, isFloating, stressFactor) {
    if (!isFloating) return baseCommitment;
    return baseCommitment + baseCommitment * (stressFactor || 0);
  }

  function btRepayment(outstanding) {
    var v = Math.abs(num(outstanding)) * (CFG().btRatePct / 100);
    if (v > 0 && v < CFG().btFloor) v = CFG().btFloor;
    return v;
  }

  function totalCommitments(rows, cardType, variant) {
    var total = 0, stressTotal = 0, unsecured = 0;
    (rows || []).forEach(function (row) {
      var r = lineCommitment(row, cardType, variant);
      total += r.commitment;
      stressTotal += stressCommitment(
        r.commitment, String(row.floating || '').toUpperCase() === 'YES',
        Engine.stressFactorFor(row));
      if (Engine.isUnsecuredLine(row)) unsecured += r.commitment;
    });
    return { total: total, stressTotal: stressTotal, unsecuredTotal: unsecured };
  }

  Engine.lineCommitment = lineCommitment;
  Engine.stressCommitment = stressCommitment;
  Engine.btRepayment = btRepayment;
  Engine.totalCommitments = totalCommitments;
})();
