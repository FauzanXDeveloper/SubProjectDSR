/* ---------------- hf summary ---------------- */

(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isFinite(n) ? n : 0; }

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

  function computeHFSummary(opts) {
    var apps = opts.applicants || [];

    var inc = Engine.calcHFIncomeMixed(apps);

    var hfType = inc.grossIncome < Engine.CONFIG.classBreak ? 'TYPE A' : 'TYPE B';

    var perApplicant = apps.map(function (a) {
      var t = Engine.totalCommitments(a.ccris, hfType, 'HF');
      var btCC = 0, btPF = 0;
      (a.bt || []).forEach(function (r) {

        if (r.type === 'BT') btCC += Math.abs(num(r.outstanding)) * (Engine.CONFIG.ccris.btRatePct / 100);
        else btPF += num(r.repayment);
      });
      var l56 = btCC + btPF;
      return { key: a.key, label: a.label, l55: t.total, l56: l56, l57: t.total - l56 };
    });
    var L55 = 0, L56 = 0, L57 = 0;
    perApplicant.forEach(function (p) { L55 += p.l55; L56 += p.l56; L57 += p.l57; });

    var isHOA = opts.product === 'HOME ONE ACCOUNT';
    var term1 = null, term2 = null, fullTenure1 = 0, fullTenure2 = 0;
    var propertyValue, fec, totalFin, effRate, instalment;
    if (isHOA) {
      var hoa = opts.hoa || {};
      propertyValue = num(hoa.propertyValue);
      term1 = hfTerm(hoa.t1 || {});
      term2 = hfTerm(hoa.t2 || {});
      fec = term1.fec + term2.fec;
      totalFin = term1.totalFinancing + term2.totalFinancing;
      instalment = term1.instalment + term2.instalment;
      effRate = null;

      fullTenure1 = term1.instalment;
      fullTenure2 = Engine.monthlyInstalment(term2.effectiveRate,
        term1.tenureYears, term2.totalFinancing);
    } else {
      propertyValue = num((opts.hf || {}).propertyValue);
      var t = hfTerm(opts.hf || {});
      fec = t.fec; totalFin = t.totalFinancing;
      effRate = t.effectiveRate; instalment = t.instalment;
    }

    var totalMOF = propertyValue > 0 ? totalFin / propertyValue : 0;

    var ctf = num(opts.ctf);
    var newCommitment = ctf !== 0 ? ctf + L57 : L57 + instalment;
    var newDSR = inc.netIncome > 0 && newCommitment > 0
      ? newCommitment / inc.netIncome : 0;
    var threshold = Engine.hfThreshold(inc.grossIncome, opts.customerType);

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
