/* ---------------- geographic lookup ---------------- */

/*
  Resolves a workplace address / postcode to one of the policy location
  buckets used by the NDI enhancement.

  Reference data comes from data/geo/myPostcodes.js (postcode -> state, city).
  Policy (which locations count as Urban) lives here, not in the data file,
  so the rules can change without regenerating the postcode table.
*/

(function () {
  'use strict';
  window.Engine = window.Engine || {};
  var Engine = window.Engine;

  var BUCKETS = {
    WP_KUALA_LUMPUR: { label: 'Wilayah Persekutuan Kuala Lumpur (Urban)', urban: true },
    WP_PUTRAJAYA: { label: 'Wilayah Persekutuan Putrajaya (Urban)', urban: true },
    PETALING_JAYA: { label: 'Petaling Jaya (Urban)', urban: true },
    SUBANG_JAYA: { label: 'Subang Jaya (Urban)', urban: true },
    SHAH_ALAM: { label: 'Shah Alam (Urban)', urban: true },
    PENANG_ISLAND: { label: 'Penang Island (Urban)', urban: true },
    JOHOR_BAHRU: { label: 'Johor Bahru (Urban)', urban: true },
    OUTSIDE_MALAYSIA: { label: 'Outside Malaysia (Urban)', urban: true },
    OTHERS: { label: 'Others (Sub-Urban)', urban: false }
  };

  /* Ordered bucket list - the dropdown uses this order. */
  var BUCKET_ORDER = [
    'WP_KUALA_LUMPUR', 'WP_PUTRAJAYA', 'PETALING_JAYA', 'SUBANG_JAYA',
    'SHAH_ALAM', 'PENANG_ISLAND', 'JOHOR_BAHRU', 'OUTSIDE_MALAYSIA', 'OTHERS'
  ];

  /* Address keywords used only when there is no usable postcode. */
  var ADDRESS_KEYWORDS = [
    ['WP_KUALA_LUMPUR', [/\bKUALA LUMPUR\b/, /\bW\.?\s?P\.?\s*KUALA LUMPUR\b/, /\bWP KUALA LUMPUR\b/]],
    ['WP_PUTRAJAYA', [/\bPUTRAJAYA\b/]],
    ['PETALING_JAYA', [/\bPETALING JAYA\b/]],
    ['SUBANG_JAYA', [/\bSUBANG JAYA\b/, /\bUSJ\b/]],
    ['SHAH_ALAM', [/\bSHAH ALAM\b/]],
    ['PENANG_ISLAND', [/\bPULAU PINANG\b/, /\bPENANG\b/, /\bGEORGE TOWN\b/, /\bBAYAN LEPAS\b/,
      /\bBATU FERRINGHI\b/, /\bTANJUNG BUNGAH\b/, /\bJELUTONG\b/, /\bPAYA TERUBONG\b/,
      /\bBALIK PULAU\b/, /\bTELUK BAHANG\b/]],
    ['JOHOR_BAHRU', [/\bJOHOR BAHRU\b/]]
  ];

  var recordIndex = null;

  function normText(value) {
    return String(value == null ? '' : value)
      .toUpperCase()
      .replace(/[^A-Z0-9.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normPostcode(value) {
    var digits = String(value == null ? '' : value).replace(/\D/g, '');
    if (!digits) return '';
    return digits.length >= 5 ? digits.slice(0, 5) : ('00000' + digits).slice(-5);
  }

  function buildIndex() {
    recordIndex = {};
    var data = window.DSR_GEO;
    if (!data || typeof data.rows !== 'string') return;

    data.rows.split('\n').forEach(function (line) {
      if (!line) return;
      var parts = line.split('|');
      if (parts.length < 3) return;
      recordIndex[parts[0]] = { postcode: parts[0], state: parts[1], city: parts[2] };
    });
  }

  function recordFor(postcode) {
    if (recordIndex === null) buildIndex();
    var key = normPostcode(postcode);
    return key && recordIndex[key] ? recordIndex[key] : null;
  }

  function isMalaysiaCountry(country) {
    var text = normText(country);
    if (!text) return true;
    return text.indexOf('MALAYSIA') !== -1 || text === 'MY' || text === 'MYS';
  }

  function bucketFromRecord(record, postcode) {
    var state = normText(record.state);
    var city = normText(record.city);
    var pc = normPostcode(postcode || record.postcode);
    var numeric = parseInt(pc, 10);

    if (state.indexOf('KUALA LUMPUR') !== -1) return 'WP_KUALA_LUMPUR';
    if (state.indexOf('PUTRAJAYA') !== -1 || city.indexOf('PUTRAJAYA') !== -1) return 'WP_PUTRAJAYA';
    if (city.indexOf('PETALING JAYA') !== -1) return 'PETALING_JAYA';
    if (city.indexOf('SUBANG JAYA') !== -1) return 'SUBANG_JAYA';
    if (city.indexOf('SHAH ALAM') !== -1) return 'SHAH_ALAM';
    if (city.indexOf('JOHOR BAHRU') !== -1) return 'JOHOR_BAHRU';

    /* Penang: 10000-11999 is the island; 12000+ is the mainland (Seberang Perai). */
    if (state.indexOf('PULAU PINANG') !== -1 || state.indexOf('PENANG') !== -1) {
      if (isFinite(numeric) && numeric >= 10000 && numeric <= 11999) return 'PENANG_ISLAND';
      return 'OTHERS';
    }

    return 'OTHERS';
  }

  function bucketFromAddress(address) {
    var text = normText(address);
    if (!text) return null;
    for (var i = 0; i < ADDRESS_KEYWORDS.length; i++) {
      var patterns = ADDRESS_KEYWORDS[i][1];
      for (var p = 0; p < patterns.length; p++) {
        if (patterns[p].test(text)) return ADDRESS_KEYWORDS[i][0];
      }
    }
    return null;
  }

  function result(bucket, extra) {
    var meta = BUCKETS[bucket] || BUCKETS.OTHERS;
    var out = {
      bucket: bucket,
      label: meta.label,
      urban: meta.urban,
      city: '',
      state: '',
      postcode: '',
      method: 'NONE',
      confidence: 'NONE',
      freeText: ''
    };
    Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  function freeTextFor(record) {
    if (!record) return '';
    return [record.city, record.state].filter(Boolean).join(', ');
  }

  /*
    input: { postcode, address, country }
    Returns { bucket, label, urban, city, state, postcode, method, confidence, freeText }
  */
  function resolveWorkplace(input) {
    input = input || {};

    if (!isMalaysiaCountry(input.country)) {
      return result('OUTSIDE_MALAYSIA', { method: 'COUNTRY', confidence: 'HIGH' });
    }

    var record = recordFor(input.postcode);
    if (record) {
      var bucket = bucketFromRecord(record, input.postcode);
      return result(bucket, {
        city: record.city,
        state: record.state,
        postcode: record.postcode,
        method: 'POSTCODE',
        confidence: 'HIGH',
        freeText: bucket === 'OTHERS' ? freeTextFor(record) : ''
      });
    }

    var fromAddress = bucketFromAddress(input.address);
    if (fromAddress) {
      return result(fromAddress, {
        method: 'ADDRESS',
        confidence: 'LOW',
        freeText: fromAddress === 'OTHERS' ? String(input.address || '').trim() : ''
      });
    }

    return result('OTHERS', {
      method: 'NONE',
      confidence: 'NONE',
      freeText: String(input.address || '').trim()
    });
  }

  function lookupPostcode(postcode) {
    return recordFor(postcode);
  }

  Engine.GEO_BUCKETS = BUCKETS;
  Engine.GEO_BUCKET_ORDER = BUCKET_ORDER;

  Engine.geo = {
    buckets: BUCKETS,
    bucketOrder: BUCKET_ORDER,
    lookupPostcode: lookupPostcode,
    resolveWorkplace: resolveWorkplace,
    normalisePostcode: normPostcode,
    incrementType: function (bucket) {
      var meta = BUCKETS[bucket];
      return meta && meta.urban ? 'urban' : 'suburban';
    }
  };
})();
