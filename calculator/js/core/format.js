/* ---------------- input formatting ---------------- */

(function () {
  'use strict';

  var CalculatorApp = window.App = window.App || {};

  function removeFormatting(value) {
    return String(value == null ? '' : value).replace(/[,\s%-]/g, '');
  }

  function formatInputValue(value, kind) {
    if (kind === 'ic') {
      return window.Engine ? window.Engine.formatIC(value) : String(value == null ? '' : value);
    }

    var rawValue = removeFormatting(value);
    if (rawValue === '') {
      return '';
    }

    var number = parseFloat(rawValue);
    if (!isFinite(number)) {
      return String(value);
    }

    if (kind === 'money') {
      return number.toLocaleString('en-MY', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    if (kind === 'pct') {
      return number.toLocaleString('en-MY', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4
      }) + '%';
    }

    if (kind === 'int') {
      return number.toLocaleString('en-MY', { maximumFractionDigits: 0 });
    }

    return String(value);
  }

  CalculatorApp.fmtInput = formatInputValue;
  CalculatorApp.rawNum = removeFormatting;

  document.addEventListener('focusin', function (event) {
    var target = event.target;
    if (!target || !target.dataset || !target.dataset.fmt) {
      return;
    }

    var rawValue = removeFormatting(target.value);
    if (rawValue !== target.value) {
      target.value = rawValue;
    }

    if (target.select) {
      setTimeout(function () {
        try { target.select(); } catch (error) {  }
      }, 0);
    }
  });

  document.addEventListener('focusout', function (event) {
    var target = event.target;
    if (!target || !target.dataset || !target.dataset.fmt) {
      return;
    }

    var formattedValue = formatInputValue(target.value, target.dataset.fmt);
    if (formattedValue !== target.value) {
      target.value = formattedValue;

      var inputEvent = document.createEvent('Event');
      inputEvent.initEvent('input', true, true);
      target.dispatchEvent(inputEvent);
    }
  });

  function formatAllInputsIn(rootElement) {
    if (!rootElement || !rootElement.querySelectorAll) {
      return;
    }

    var inputs = rootElement.querySelectorAll('input[data-fmt]');
    for (var index = 0; index < inputs.length; index++) {
      var input = inputs[index];
      if (input === document.activeElement) {
        continue;
      }

      var formattedValue = formatInputValue(input.value, input.dataset.fmt);
      if (formattedValue !== input.value) {
        input.value = formattedValue;
      }
    }
  }

  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function (mutations) {
      for (var mutationIndex = 0; mutationIndex < mutations.length; mutationIndex++) {
        var addedNodes = mutations[mutationIndex].addedNodes;
        for (var nodeIndex = 0; nodeIndex < addedNodes.length; nodeIndex++) {
          formatAllInputsIn(addedNodes[nodeIndex]);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  CalculatorApp.formatAllInputs = function () {
    formatAllInputsIn(document);
  };

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') {
      return;
    }

    var target = event.target;
    if (target && target.tagName === 'INPUT' && target.dataset && target.dataset.fmt) {
      event.preventDefault();
      target.blur();
    }
  });
})();
