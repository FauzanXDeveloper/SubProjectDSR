/* ============================================================
   ccrisLine.js - unified per-CCRIS-line monthly commitment
   Source: 03_Home_Financing_Manual_DSR.txt section 3 (full rule),
   CRDTCARD TYPE A/B treatment from credit_card.txt section 3,
   stress test from 04_PF_CCRIS_DSR_Evaluation_Report.txt sec 3.
   ============================================================ */
(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isFinite(n) ? n : 0; }
  function CFG() { return window.Engine.CONFIG.ccris; }

  /** An override is "applied" whenever the cell is not empty - including an
      explicit 0 (force the commitment to RM0). A blank/null cell means no
      override, so the normal facility rule runs. */
  function hasOverride(v) {
    return v != null && String(v).replace(/[,\s%]/g, '').trim() !== '';
  }
  Engine.hasOverride = hasOverride;

  /**
   * Monthly commitment for one CCRIS debt line.
   * row: { capacity, collateral, facility, outstanding, limit,
   *        commitmentPerCCRIS, override, floating }
   * cardType: 'TYPE A' | 'TYPE B'  (credit-card limit treatment)
   * variant: 'HF' for the Home Financing master, whose TYPE B credit-card
   *          rule is 5% of outstanding with NO RM50 floor (Excel O15
   *          TYPE B branch: IF(AND(G*5%<=50,G*5%>0),G*5%,G*5%)); PF keeps
   *          the floor. Omit for PF/CC behaviour (unchanged).
   * Returns { commitment, overridden }
   */
  function lineCommitment(row, cardType, variant) {
    var K = num(row.override);
    var G = Math.abs(num(row.outstanding));
    var H = Math.abs(num(row.limit));
    var J = Math.abs(num(row.commitmentPerCCRIS));
    var F = String(row.facility || '').toUpperCase().trim();
    var capacity = String(row.capacity || '').toUpperCase().trim();

    if (hasOverride(row.override)) return { commitment: Math.abs(K), overridden: true };

    if (F === 'CRDTCARD') {
      // Nothing drawn -> no commitment: neither the RM50 floor nor the
      // 5%-of-limit leg applies. Both masters (PF L17 / HF L15) spell this
      // rule out as AND(F="CRDTCARD",G=0)->0, but put it in a branch the
      // outer IF(F="CRDTCARD",MAX(O:P),...) makes unreachable, so they still
      // bill TYPE A 5% of limit on a zero-outstanding card. Deliberate
      // divergence - see excel-parity-tests.js "known formula diffs".
      if (G === 0) return { commitment: 0, overridden: false };
      // Excel L = MAX(O,P):
      //   O (all types) = 5% of OUTSTANDING, floored to RM50 when > 0
      //   P: TYPE B = 0, otherwise 5% of LIMIT
      var cardRate = CFG().cardRatePct / 100, floor = CFG().cardFloor;
      var o = G * cardRate;
      if (o > 0 && o < floor && !(variant === 'HF' && cardType === 'TYPE B')) o = floor;
      var v = cardType === 'TYPE B' ? o : Math.max(o, H * cardRate);
      return { commitment: v, overridden: false };
    }

    var rate = Engine.facilityFactor(F);

    if (capacity === 'JOINT') {
      // joint housing: (rate*J)/2 ; other joint: J/2 (rate=1 for most)
      if (F.indexOf('HL') === 0 || F.indexOf('HS') === 0) {
        return { commitment: (rate * J) / 2, overridden: false };
      }
      return { commitment: J / 2, overridden: false };
    }

    if (Object.prototype.hasOwnProperty.call(Engine.OD_FACILITIES, F)) {
      return { commitment: H * rate, overridden: false }; // overdraft: on LIMIT
    }
    if (rate === CFG().cardRatePct / 100 && F !== 'CRDTCARD') {
      // card-rate treatment for any facility an admin points at the card rate
      var w = G * rate;
      if (w > 0 && w < CFG().cardFloor) w = CFG().cardFloor;
      return { commitment: w, overridden: false };
    }
    return { commitment: rate * J, overridden: false };
  }

  /**
   * Stress-test commitment (Excel col T): floating-rate lines get the
   * collateral-type buffer from List!A28:B32 (fixed table, not an input).
   */
  function stressCommitment(baseCommitment, isFloating, stressFactor) {
    if (!isFloating) return baseCommitment;
    return baseCommitment + baseCommitment * (stressFactor || 0);
  }

  /** Balance-transfer repayment on a CC outstanding being settled:
      5% of outstanding, floored to RM50 (credit_card.txt section 3). */
  function btRepayment(outstanding) {
    var v = Math.abs(num(outstanding)) * (CFG().btRatePct / 100);
    if (v > 0 && v < CFG().btFloor) v = CFG().btFloor;
    return v;
  }

  /**
   * Totals across all lines.
   * Returns { total (L55), stressTotal (T-total), unsecuredTotal }
   */
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
