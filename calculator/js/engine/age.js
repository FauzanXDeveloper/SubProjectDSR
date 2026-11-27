/* ---------------- age ---------------- */

(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function calculateAgeFromIC(ic) {
    var cleaned = String(ic || '').replace(/[-\s]/g, '');
    if (!/^\d{6}/.test(cleaned)) return null;
    var yy = parseInt(cleaned.slice(0, 2), 10);
    var now = new Date();
    var curYY = now.getFullYear() % 100;
    var fullYear = (yy > curYY) ? 1900 + yy : 2000 + yy;
    var age = now.getFullYear() - fullYear;
    if (age > 100) age = now.getFullYear() - (1900 + yy);
    if (age < 0) return null;
    return age;
  }

  function formatIC(ic) {
    var digits = String(ic == null ? '' : ic).replace(/\D/g, '');
    if (digits.length !== 12) return String(ic == null ? '' : ic);
    return digits.slice(0, 6) + '-' + digits.slice(6, 8) + '-' + digits.slice(8);
  }

  Engine.calculateAgeFromIC = calculateAgeFromIC;
  Engine.formatIC = formatIC;
})();
