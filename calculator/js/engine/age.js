/* ============================================================
   age.js - robust age from Malaysian IC
   Source: credit_card.txt section 1 (pdfExtractor.ts variant,
   full date-of-birth diff, handles birth years >= 2000)
   ============================================================ */
(function () {
  'use strict';
  window.Engine = window.Engine || {};

  /** Returns age in whole years (current year - birth year only, e.g.
      2026 - 1989 = 37 - the birthday within the year is ignored),
      or null when IC is not parseable. */
  function calculateAgeFromIC(ic) {
    var cleaned = String(ic || '').replace(/[-\s]/g, '');
    if (!/^\d{6}/.test(cleaned)) return null;
    var yy = parseInt(cleaned.slice(0, 2), 10);
    var now = new Date();
    var curYY = now.getFullYear() % 100;
    var fullYear = (yy > curYY) ? 1900 + yy : 2000 + yy;
    var age = now.getFullYear() - fullYear;   // year-only difference
    if (age > 100) age = now.getFullYear() - (1900 + yy);
    if (age < 0) return null;
    return age;
  }

  /** Format a Malaysian IC for display as dddddd-dd-dddd
      (e.g. 970502025230 -> 970502-02-5230). Non-12-digit values
      (passports, partial entries) are returned unchanged. */
  function formatIC(ic) {
    var digits = String(ic == null ? '' : ic).replace(/\D/g, '');
    if (digits.length !== 12) return String(ic == null ? '' : ic);
    return digits.slice(0, 6) + '-' + digits.slice(6, 8) + '-' + digits.slice(8);
  }

  Engine.calculateAgeFromIC = calculateAgeFromIC;
  Engine.formatIC = formatIC;
})();
