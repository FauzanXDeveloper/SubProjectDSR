/* ---------------- NDI enhancement (v2) ---------------- */

/*
  New calculation layer for the PF NDI enhancement. This file is additive:
  the existing NDI (net income - new commitment) and the existing stress
  test stay in products/pf/pf.js untouched.

  Two derived figures live here:

  1. Net Income with Assumed Increment
       net income x 1.0468 for Urban locations
       net income x 1.0374 for Sub-Urban locations

  2. Revised Stress NDI
       Stress NDI = NDI - (NDI x cost factor)
       cost factor = base + (base x household add-on)

       Urban base 7.49%   add-ons 43.32% / 66.59% / 79.71%
       Sub-Urban 7.55%    add-ons 34.04% / 48.70% / 63.16%

  Policy numbers come from Engine.CONFIG.pf.ndiV2 when present, so a
  PolicyConfig override can re-price them without touching this file.
*/

(function () {
  'use strict';
  window.Engine = window.Engine || {};
  var Engine = window.Engine;

  var FALLBACK = {
    increment: { urban: 0.0468, suburban: 0.0374 },
    cost: {
      urban: { base: 0.0749, h2: 0.4332, h3: 0.6659, h4: 0.7971 },
      suburban: { base: 0.0755, h2: 0.3404, h3: 0.4870, h4: 0.6316 }
    },
    onMissing: 'none'
  };

  var HOUSEHOLD_LABELS = {
    h1: '1',
    h2: '2',
    h3: '3',
    h4: '4 and above'
  };

  function merge(target, source) {
    var out = {};
    Object.keys(target || {}).forEach(function (k) { out[k] = target[k]; });
    Object.keys(source || {}).forEach(function (k) {
      if (source[k] != null) out[k] = source[k];
    });
    return out;
  }

  function settings() {
    var configured = (window.Engine.CONFIG &&
      window.Engine.CONFIG.pf &&
      window.Engine.CONFIG.pf.ndiV2) || {};
    var configuredCost = configured.cost || {};
    return {
      increment: merge(FALLBACK.increment, configured.increment),
      cost: {
        urban: merge(FALLBACK.cost.urban, configuredCost.urban),
        suburban: merge(FALLBACK.cost.suburban, configuredCost.suburban)
      },
      onMissing: configured.onMissing || FALLBACK.onMissing
    };
  }

  function num(value) {
    var n = parseFloat(String(value == null ? '' : value).replace(/[,\s%]/g, ''));
    return isFinite(n) ? n : 0;
  }

  /* Accepts a bucket key (e.g. PETALING_JAYA) or 'urban' / 'suburban'. */
  function locationType(location) {
    var value = String(location == null ? '' : location).trim();
    if (!value) return null;
    if (value === 'urban' || value === 'suburban') return value;
    if (window.Engine.GEO_BUCKETS && window.Engine.GEO_BUCKETS[value]) {
      return window.Engine.GEO_BUCKETS[value].urban ? 'urban' : 'suburban';
    }
    return null;
  }

  /* '4 and above', 4, '4' -> 'h4'; blank / 0 -> null */
  function householdKey(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return null;
    var n = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!isFinite(n) || n <= 0) return null;
    if (n >= 4) return 'h4';
    return 'h' + n;
  }

  function costFactor(location, household) {
    var type = locationType(location);
    var key = householdKey(household);
    if (!type || !key) return null;
    var cost = settings().cost[type];
    var factor = num(cost.base);
    if (key !== 'h1') factor += num(cost.base) * num(cost[key]);
    return factor;
  }

  function incrementFactor(location) {
    var type = locationType(location);
    if (!type) return null;
    return num(settings().increment[type]);
  }

  /*
    netIncome : monthly net income from the income engine
    ndi       : existing NDI (net income - new commitment)
    location  : workplace bucket or 'urban'/'suburban'
    household : '1' | '2' | '3' | '4' (or '4 and above')
  */
  function compute(input) {
    input = input || {};

    var netIncome = num(input.netIncome);
    var ndi = num(input.ndi);
    var type = locationType(input.location);
    var key = householdKey(input.household);
    var increment = incrementFactor(input.location);
    var factor = costFactor(input.location, input.household);

    var applied = increment !== null && factor !== null;

    return {
      applied: applied,
      location: input.location || '',
      locationType: type || '',
      household: key || '',
      householdLabel: key ? HOUSEHOLD_LABELS[key] : '',
      incrementFactor: increment,
      upliftAmount: increment === null ? 0 : netIncome * increment,
      assumedNetIncome: increment === null ? netIncome : netIncome * (1 + increment),
      costFactor: factor,
      costPct: factor === null ? 0 : factor * 100,
      stressNdiV2: factor === null ? ndi : ndi - ndi * factor
    };
  }

  Engine.NDI_V2_HOUSEHOLD_LABELS = HOUSEHOLD_LABELS;

  Engine.ndiV2 = {
    settings: settings,
    locationType: locationType,
    householdKey: householdKey,
    incrementFactor: incrementFactor,
    costFactor: costFactor,
    compute: compute
  };
})();
