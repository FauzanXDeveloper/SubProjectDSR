/* ---------------- hf pricing ---------------- */

(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isFinite(n) ? n : 0; }

  function hfStructured(i) {
    var property = num(i.propertyValue), financing = num(i.financing);
    var mrtt = num(i.mrtt), valuation = num(i.valuation), legal = num(i.legal);
    var tenure = num(i.tenureYears);
    var ceiling = num(i.ceilingRate), base = num(i.baseRate), spread = num(i.spread);

    var fec = valuation + legal;
    var totalFin = financing + mrtt + fec;
    var effRate = base + spread;
    var mrttFecRatio = property > 0 ? (mrtt + fec) / property : 0;

    return {
      fec: fec,
      totalFinancing: totalFin,
      origMOF: property > 0 ? financing / property : 0,
      mrttFecRatio: mrttFecRatio,
      totalMOF: property > 0 ? totalFin / property : 0,
      effectiveRate: effRate,
      sellingPrice: Engine.sellingPrice(ceiling, tenure, totalFin),
      instalmentCeiling: Engine.monthlyInstalment(ceiling, tenure, totalFin),
      instalmentEffective: Engine.monthlyInstalment(effRate, tenure, totalFin),
      note: mrttFecRatio <= 0.05 ? 'MRTT + FEC within 5%' : 'MRTT + FEC exceeded 5%'
    };
  }

  function hfFixed(i) {
    var property = num(i.propertyValue), financing = num(i.financing);
    var mrtt = num(i.mrtt), valuation = num(i.valuation), legal = num(i.legal);
    var tenure = num(i.tenureYears), rate = num(i.rate);

    var entry = mrtt + valuation + legal;
    var totalFin = financing + entry;
    var entryRatio = property > 0 ? entry / property : 0;

    return {
      entryCosts: entry,
      entryGuide3pct: property * 0.03,
      totalFinancing: totalFin,
      hfMOF: property > 0 ? financing / property : 0,
      fecMOF: property > 0 ? entry / property : 0,
      totalMOF: property > 0 ? totalFin / property : 0,
      entryRatio: entryRatio,
      sellingPrice: Engine.sellingPrice(rate, tenure, totalFin),
      instalment: Engine.monthlyInstalment(rate, tenure, totalFin),
      note: entryRatio <= 0.05 ? 'within 5%' : 'not within 5%'
    };
  }

  function hfPUC(i) {
    var property = num(i.propertyValue), financing = num(i.financing);
    var mrtt = num(i.mrtt), valuation = num(i.valuation), legal = num(i.legal);
    var tenure = num(i.tenureYears), grace = num(i.graceYears);
    var ceiling = num(i.ceilingRate), base = num(i.baseRate), spread = num(i.spread);

    var fec = valuation + legal;
    var totalFin = financing + mrtt + fec;
    var effRate = base + spread;
    var mrttFecRatio = property > 0 ? (mrtt + fec) / property : 0;

    var sellingWithGrace = Math.round(
      (ceiling * totalFin * grace)
      + Engine.PMT(ceiling / 12, tenure * 12, -totalFin) * tenure * 12
    );

    var graceMonthlyCeiling = grace > 0 ? (ceiling * totalFin) / 12 : 0;
    var graceMonthlyEffective = grace > 0 ? (effRate * totalFin) / 12 : 0;

    return {
      fec: fec,
      totalFinancing: totalFin,
      totalMOF: property > 0 ? totalFin / property : 0,
      mrttFecRatio: mrttFecRatio,
      effectiveRate: effRate,
      sellingPriceWithGrace: sellingWithGrace,
      instalmentCeiling: Engine.monthlyInstalment(ceiling, tenure, totalFin),
      graceMonthlyCeiling: Math.round(graceMonthlyCeiling),
      graceMonthlyEffective: Math.round(graceMonthlyEffective),
      instalmentEffective: Engine.monthlyInstalment(effRate, tenure, totalFin),
      note: mrttFecRatio <= 0.05 ? 'MRTT + FEC within 5%' : 'MRTT + FEC exceeded 5%'
    };
  }

  function hfHomeOneTerm(t, property, sbr, ceiling) {
    var financing = num(t.financing), renovation = num(t.renovation);
    var mrtt = num(t.mrtt), valuation = num(t.valuation), legal = num(t.legal);
    var tenure = num(t.tenureYears), spread = num(t.spread);

    var fec = valuation + legal;
    var totalFin = financing + renovation + mrtt + fec;
    var effRate = sbr + spread;
    return {
      financing: financing, renovation: renovation, mrtt: mrtt,
      valuation: valuation, legal: legal, tenure: tenure, spread: spread,
      fec: fec, totalFinancing: totalFin,
      origMOF: property > 0 ? (financing + renovation) / property : 0,
      fecMOF: property > 0 ? fec / property : 0,
      mrttMOF: property > 0 ? (mrtt + fec) / property : 0,
      totalMOF: property > 0 ? totalFin / property : 0,
      effectiveRate: effRate,
      sellingPriceCeiling: Engine.sellingPrice(ceiling, tenure, totalFin),
      instalmentCeiling: Engine.monthlyInstalment(ceiling, tenure, totalFin),
      instalmentEffective: Engine.monthlyInstalment(effRate, tenure, totalFin)
    };
  }

  function hfHomeOne(i) {
    var property = num(i.propertyValue), sbr = num(i.sbr), ceiling = num(i.ceiling);
    var t1 = hfHomeOneTerm(i.t1 || {}, property, sbr, ceiling);
    var t2 = hfHomeOneTerm(i.t2 || {}, property, sbr, ceiling);
    var totalFin = t1.totalFinancing + t2.totalFinancing;
    var totalFec = t1.fec + t2.fec;
    var totalMrtt = t1.mrtt + t2.mrtt;
    var totalOrig = (t1.financing + t1.renovation) + (t2.financing + t2.renovation);

    var totals = {
      financing: t1.financing + t2.financing,
      renovation: t1.renovation + t2.renovation,
      mrtt: totalMrtt, valuation: t1.valuation + t2.valuation,
      legal: t1.legal + t2.legal, fec: totalFec,
      totalFinancing: totalFin,
      origMOF: property > 0 ? totalOrig / property : 0,
      fecMOF: property > 0 ? totalFec / property : 0,
      mrttMOF: property > 0 ? (totalMrtt + totalFec) / property : 0,
      totalMOF: property > 0 ? totalFin / property : 0,
      sellingPriceCeiling: t1.sellingPriceCeiling + t2.sellingPriceCeiling,
      instalmentCeiling: t1.instalmentCeiling + t2.instalmentCeiling,
      instalmentEffective: t1.instalmentEffective + t2.instalmentEffective
    };

    var blendedRate = totalFin > 0
      ? t1.effectiveRate * (t1.totalFinancing / totalFin)
        + t2.effectiveRate * (t2.totalFinancing / totalFin)
      : 0;
    var mrttFecRatio = totals.mrttMOF;
    return {
      property: property, sbr: sbr, ceiling: ceiling,
      t1: t1, t2: t2, totals: totals,
      blendedRate: blendedRate, mrttFecRatio: mrttFecRatio,
      entryGuide3pct: property * 0.03,
      note: mrttFecRatio <= 0.05 ? 'MRTT + FEC within 5%' : 'MRTT + FEC exceeded 5%'
    };
  }

  Engine.hfStructured = hfStructured;
  Engine.hfFixed = hfFixed;
  Engine.hfPUC = hfPUC;
  Engine.hfHomeOne = hfHomeOne;
})();
