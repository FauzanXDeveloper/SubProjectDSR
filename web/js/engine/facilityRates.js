/* ============================================================
   facilityRates.js - ONE canonical facility-code -> factor table
   Source: 03_Home_Financing_Manual_DSR.txt section 4 (List!D:E),
   reconciled per credit_card.txt section 8 point 2:
   unknown facility -> factor 1 (use CCRIS instalment as-is).
   ============================================================ */
(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function CFG() { return window.Engine.CONFIG.ccris; }

  /* Special-treatment facility groups. The rate each group carries comes
     from the central config (cardRatePct / odRatePct); every other code's
     factor lives in CONFIG.ccris.facilityFactors (admin-editable). */
  var OD_FACILITIES = { OVRDRAFT: 1, TEMPOVDT: 1 };   // % of LIMIT

  function facilityFactor(code) {
    var c = String(code || '').toUpperCase().trim();
    if (c === 'CRDTCARD') return CFG().cardRatePct / 100;
    if (Object.prototype.hasOwnProperty.call(OD_FACILITIES, c)) return CFG().odRatePct / 100;
    var map = CFG().facilityFactors || {};
    if (Object.prototype.hasOwnProperty.call(map, c)) return map[c];
    return 1; // default per PF/HF spec: commitment = CCRIS instalment as-is
  }

  /** Facilities counted in the unsecured new-commitment sum (Excel G125):
      the line must be one of these facilities AND collateral = "CLEAN". */
  var UNSECURED_FACILITIES = {
    CRDTCARD: 1, OTLNFNCE: 1, OVRDRAFT: 1, PELNFNCE: 1,
    RVVGCRDT: 1, STLNFNCE: 1, NHEDFNCE: 1, PELNFNSA: 1
  };
  function isUnsecuredLine(row) {
    var f = String(row.facility || '').toUpperCase().trim();
    var col = String(row.collateral || '').toUpperCase().trim();
    return col === 'CLEAN' &&
      Object.prototype.hasOwnProperty.call(UNSECURED_FACILITIES, f);
  }

  /** Stress-test % incremental by collateral type (Excel List!A28:B32).
      Fixed table - not a user input. Unknown collateral -> 0 (IFNA(...,0)).

      Excel T: IF(F="", 0, VLOOKUP(collateral, List!A28:B32, 2, 0)) - written
      as IF(F17=List!$D$3,...) where List!D3 is the BLANK cell above the
      facility list (the CRDTCARD label is missing from D3; only its 0.05
      rate survives at E3). So the zero-branch fires for a blank facility,
      i.e. an empty row - NOT for credit cards. A floating CRDTCARD line does
      take its collateral uplift. */
  function stressFactorFor(row) {
    if (!String(row.facility || '').trim()) return 0;   // F = List!D3 (blank)
    var col = String(row.collateral || '').toUpperCase().replace(/\s+/g, ' ').trim();
    var map = CFG().stressFactors || {};
    return Object.prototype.hasOwnProperty.call(map, col) ? map[col] / 100 : 0;
  }

  /* Canonical facility-code list for dropdowns (original List!D:E order). */
  Engine.FACILITY_LIST = [
    'CRDTCARD', 'HLFNNNPS', 'HLFNPRSR', 'HRPCNSCG', 'HRPCSCGD', 'HSLNFNCE',
    'ISPJTFNG', 'ISPWNBKG', 'MICROFNCE', 'OHRPCREC', 'OTLNFNCE', 'OVRDRAFT',
    'PCPASCAR', 'PELNFNCE', 'RVVGCRDT', 'SHMARGIN', 'SOFTLN', 'STLNFNCE',
    'TEMPOVDT', 'NHEDFNCE', 'PELNFNSA', 'OTHER'
  ];

  Engine.OD_FACILITIES = OD_FACILITIES;
  Engine.facilityFactor = facilityFactor;
  Engine.isUnsecuredLine = isUnsecuredLine;
  Engine.stressFactorFor = stressFactorFor;
})();
