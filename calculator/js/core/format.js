/* ============================================================
   format.js - display formatting for numeric inputs.
   Inputs carry data-fmt="money" | "pct" | "int" | "ic":
     money -> 1,234,567.89   pct -> 4.25%   int -> 1,234
     ic    -> 900101-01-5566 (Malaysian IC, via Engine.formatIC)
   Focus shows the raw value for editing; blur (or Enter) formats
   it and pushes the value through the normal input pipeline. All
   engine num() parsers strip commas/%/dashes so the formatted
   strings stay calculation-safe.
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  function raw(v) { return String(v == null ? '' : v).replace(/[,\s%-]/g, ''); }

  /** Format a stored value for display inside an input. */
  function fmtInput(v, kind) {
    if (kind === 'ic') return window.Engine ? window.Engine.formatIC(v) : String(v == null ? '' : v);
    var r = raw(v);
    if (r === '') return '';
    var n = parseFloat(r);
    if (!isFinite(n)) return String(v);
    if (kind === 'money') {
      return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (kind === 'pct') {
      return n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 4 }) + '%';
    }
    if (kind === 'int') {
      return n.toLocaleString('en-MY', { maximumFractionDigits: 0 });
    }
    return String(v);
  }
  App.fmtInput = fmtInput;
  App.rawNum = raw;

  // focus: show the raw number and select it for quick replacement
  document.addEventListener('focusin', function (ev) {
    var t = ev.target;
    if (!t || !t.dataset || !t.dataset.fmt) return;
    var r = raw(t.value);
    if (r !== t.value) t.value = r;
    if (t.select) setTimeout(function () { try { t.select(); } catch (e) {} }, 0);
  });

  // blur: format and push the value through the normal input pipeline
  document.addEventListener('focusout', function (ev) {
    var t = ev.target;
    if (!t || !t.dataset || !t.dataset.fmt) return;
    var f = fmtInput(t.value, t.dataset.fmt);
    if (f !== t.value) {
      t.value = f;
      var e2 = document.createEvent('Event');
      e2.initEvent('input', true, true);
      t.dispatchEvent(e2);
    }
  });

  // format inputs as soon as they are (re)rendered, so stored values
  // display as 1,234.56 / 4.25% without waiting for a blur
  function formatAllIn(root) {
    if (!root || !root.querySelectorAll) return;
    var list = root.querySelectorAll('input[data-fmt]');
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t === document.activeElement) continue;
      var f = fmtInput(t.value, t.dataset.fmt);
      if (f !== t.value) t.value = f;   // display only; state keeps its value
    }
  }
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        for (var j = 0; j < muts[i].addedNodes.length; j++) {
          formatAllIn(muts[i].addedNodes[j]);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  App.formatAllInputs = function () { formatAllIn(document); };

  // Enter commits the value (same as leaving the field)
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var t = ev.target;
    if (t && t.tagName === 'INPUT' && t.dataset && t.dataset.fmt) {
      ev.preventDefault();
      t.blur();
    }
  });
})();
