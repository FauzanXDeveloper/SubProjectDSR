/* ============================================================
   hfSummary.js - HF DSR consolidation per the master
   "Home Financing Manual DSR.xlsm" Summary sheet (single +
   joint applicants). Pure functions - no DOM.
   ============================================================ */
(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isFinite(n) ? n : 0; }

  /** One financing term (HF column G or one HOA term column J/K):
      FEC G145 = valuation + legal; Total G147 = financing + MRTT + FEC;
      Effective rate G151 = SBR + spread;
      Instalment G153 = ROUND(PMT(eff/12, years*12, -total), 0). */
  function hfTerm(t) {
    var fec = num(t.valuation) + num(t.legal);
    var totalFin = num(t.financing) + num(t.mrtt) + fec;
    var effRate = (num(t.sbrPct) + num(t.spreadPct)) / 100;
    return {
      fec: fec, totalFinancing: totalFin, effectiveRate: effRate,
      tenureYears: num(t.tenureYears),
      instalment: Engine.monthlyInstalment(effRate, num(t.tenureYears), totalFin)
    };
  }

  /**
   * Full HF Summary computation.
   * opts: {
   *   applicants: [{ key, label, months, bizman, ccris, bt }],  // main first
   *   customerType: 'NORMAL' | 'BIZMAN',                        // Summary C10
   *   product: 'HOME FINANCING' | 'HOME ONE ACCOUNT',           // Summary C11
   *   hf:  { propertyValue, financing, mrtt, valuation, legal,
   *          tenureYears, sbrPct, spreadPct },                  // Summary col G
   *   hoa: { propertyValue, t1: {...same as hf...}, t2: {...} },// Summary J/K
   *   ctf: number                                               // Summary G159
   * }
   */

  function computeHFSummary(opts) {
    var apps = opts.applicants || [];

    // Income (Summary rows 78-148): each applicant contributes its own
    // resolved stream - payslip months, an EPF statement, or business income -
    // and the unified combiner sums them. Handles a mixed joint (e.g. NORMAL
    // main + BIZMAN joint) and reduces exactly to the old all-normal /
    // all-bizman / EPF paths, so every parity figure is unchanged.
    var inc = Engine.calcHFIncomeMixed(apps);

    // P12 (per-applicant sheets): TYPE keyed off combined HF gross C144
    var hfType = inc.grossIncome < Engine.CONFIG.classBreak ? 'TYPE A' : 'TYPE B';

    // Commitments: per-applicant L55/L56/L57; Summary = sum of the sheets
    var perApplicant = apps.map(function (a) {
      var t = Engine.totalCommitments(a.ccris, hfType, 'HF');
      var btCC = 0, btPF = 0;
      (a.bt || []).forEach(function (r) {
        // HF master D62 = C62*5% - NO RM50 floor (the floor is PF/CC only)
        if (r.type === 'BT') btCC += Math.abs(num(r.outstanding)) * (Engine.CONFIG.ccris.btRatePct / 100);
        else btPF += num(r.repayment);
      });
      var l56 = btCC + btPF;
      return { key: a.key, label: a.label, l55: t.total, l56: l56, l57: t.total - l56 };
    });
    var L55 = 0, L56 = 0, L57 = 0;
    perApplicant.forEach(function (p) { L55 += p.l55; L56 += p.l56; L57 += p.l57; });

    // New financing
    var isHOA = opts.product === 'HOME ONE ACCOUNT';
    var term1 = null, term2 = null, fullTenure1 = 0, fullTenure2 = 0;
    var propertyValue, fec, totalFin, effRate, instalment;
    if (isHOA) {
      var hoa = opts.hoa || {};
      propertyValue = num(hoa.propertyValue);
      term1 = hfTerm(hoa.t1 || {});
      term2 = hfTerm(hoa.t2 || {});
      fec = term1.fec + term2.fec;                            // L145
      totalFin = term1.totalFinancing + term2.totalFinancing; // L147
      instalment = term1.instalment + term2.instalment;       // L153 -> G158
      effRate = null;
      // Rows 155 "Instalment Based on Full Tenure": term 2 re-amortised
      // over TERM 1's tenure (Excel K155 uses J146)
      fullTenure1 = term1.instalment;
      fullTenure2 = Engine.monthlyInstalment(term2.effectiveRate,
        term1.tenureYears, term2.totalFinancing);
    } else {
      propertyValue = num((opts.hf || {}).propertyValue);
      var t = hfTerm(opts.hf || {});
      fec = t.fec; totalFin = t.totalFinancing;
      effRate = t.effectiveRate; instalment = t.instalment;   // G153 -> G158
    }
    // G148/L148 - KNOWN DIFF: the Excel divides by $J$140 (the HOME ONE
    // ACCOUNT property value) even in the HOME FINANCING column; the
    // system uses the selected product's own property value.
    var totalMOF = propertyValue > 0 ? totalFin / propertyValue : 0;

    // DSR block (Summary G158-G162 + verdict H162)
    var ctf = num(opts.ctf);
    var newCommitment = ctf !== 0 ? ctf + L57 : L57 + instalment;  // G160
    var newDSR = inc.netIncome > 0 && newCommitment > 0
      ? newCommitment / inc.netIncome : 0;                         // G162
    var threshold = Engine.hfThreshold(inc.grossIncome, opts.customerType);
    // H162: blank when DSR 0; OK when threshold >= DSR, else DSR BURST
    var verdict = newDSR === 0 ? ''
      : (threshold >= newDSR ? Engine.VERDICT.OK : Engine.VERDICT.DSR_BURST);

    return {
      income: inc, hfType: hfType,
      perApplicant: perApplicant,
      totalCommitment: L55, btTotal: L56, grandTotal: L57,
      isHOA: isHOA, term1: term1, term2: term2,
      fullTenure1: fullTenure1, fullTenure2: fullTenure2,
      fec: fec, totalFinancing: totalFin, totalMOF: totalMOF,
      effectiveRate: effRate, instalment: instalment,
      ctf: ctf, newCommitment: newCommitment, newDSR: newDSR,
      threshold: threshold, verdict: verdict
    };
  }

  Engine.hfTerm = hfTerm;
  Engine.computeHFSummary = computeHFSummary;
})();
