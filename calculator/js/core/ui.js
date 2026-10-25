/* ============================================================
   core/ui.js - shared helpers used by every product panel
   (number parsing, escaping, tiles, gauge, field builders).
   Also the product registry and the Malaysian date helper.
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;
  var App = window.App = window.App || {};
  var E = window.Engine;
  var fmt = E.formatCurrency;
  var amt = E.formatAmount;      // CCRIS grids: bare numbers, no RM
  var fmtPct = E.formatPct;
  // every DSR reading is shown to 2 dp; thresholds stay whole (fmtPct(x, 0))
  var DSR_DP = 2;
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isFinite(n) ? n : 0; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }
  // Officer-facing decision is two-state (APPROVED green / REJECTED red);
  // the internal Excel-parity verdicts still drive the class via the engine.
  function vClass(verdict) { return E.verdictClass(verdict); }
  function vLabel(verdict) { return E.verdictLabel(verdict); }
  function tile(label, value, cls) {
    return '<div class="tile' + (cls ? ' ' + cls : '') + '"><div class="t-label">' + label +
      '</div><div class="t-value">' + value + '</div></div>';
  }
  /** The bar still turns red once the DSR is over the limit (that is the
      verdict), but the limit itself is never drawn or named: the marker line
      and the "Threshold x%" caption are deliberately gone so the capping
      thresholds stay internal. */
  function gauge(dsr, threshold) {
    var pct = Math.min(100, Math.max(0, dsr * 100));
    return '<div class="gauge"><div class="fill' + (dsr > threshold ? ' over' : '') +
      '" style="width:' + pct + '%"></div></div>' +
      '<div class="gauge-cap"><span>DSR ' + fmtPct(dsr, DSR_DP) + '</span></div>';
  }
  /** Numeric fields are text inputs with a display format derived from
      the label: "(RM" -> money, "(%)" -> pct, tenure/years/months -> int.
      format.js formats on blur/Enter; num() strips commas/% back out. */
  function field(label, id, value, opts) {
    opts = opts || {};
    var kind = opts.fmt;
    if (kind == null && !opts.text) {
      if (label.indexOf('(RM') !== -1) kind = 'money';
      else if (label.indexOf('(%)') !== -1) kind = 'pct';
      else if (/tenure|years|months|grace/i.test(label)) kind = 'int';
    }
    var shown = kind ? App.fmtInput(value, kind) : value;
    return '<div class="field"><label>' + label + '</label>' +
      '<input class="editable" type="text"' +
      (kind ? ' inputmode="decimal" data-fmt="' + kind + '"' : '') +
      ' id="' + id + '" value="' + esc(shown) + '"></div>';
  }
  function bindNum(id, obj, key) {
    var n = el(id);
    if (n) n.oninput = function () { obj[key] = this.value; App.refreshOutputs(); };
  }
  function cardShell(id, title, bodyHtml) {
    return '<div class="card" id="' + id + '"><div class="card-head" data-toggle="' + id + '">' +
      '<span>' + title + '</span><span class="chev">&#9662;</span></div>' +
      '<div class="card-body">' + bodyHtml + '</div></div>';
  }

  App.today = function () {
    return new Date(Date.now() + 8 * 60 * 60000).toISOString().slice(0, 10);
  };
  App.products = [];
  App.registerProduct = function (p) { App.products.push(p); };
  App.runSeed = function (id) {
    App.products.forEach(function (p) {
      if (p.id === id && p.seed && App[p.seed]) App[p.seed]();
    });
  };
  App.mod = App.mod || {};
  App.mod.ui = { fmt: fmt, amt: amt, fmtPct: fmtPct, DSR_DP: DSR_DP, num: num, esc: esc, el: el, vClass: vClass, vLabel: vLabel, tile: tile, gauge: gauge, field: field, bindNum: bindNum, cardShell: cardShell };
})();
