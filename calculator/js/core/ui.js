/* ---------------- shared controls ---------------- */

(function () {
  'use strict';

  var CalculatorApp = window.App = window.App || {};
  var calculatorEngine = window.Engine;

  var formatCurrency = calculatorEngine.formatCurrency;
  var formatAmount = calculatorEngine.formatAmount;
  var formatPercent = calculatorEngine.formatPct;

  var DSR_DECIMALS = 2;

  function parseNumber(value) {
    var cleaned = String(value == null ? '' : value).replace(/[,\s%]/g, '');
    var number = parseFloat(cleaned);
    return isFinite(number) ? number : 0;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getElementById(elementId) {
    return document.getElementById(elementId);
  }

  function verdictClass(verdict) {
    return calculatorEngine.verdictClass(verdict);
  }

  function verdictLabel(verdict) {
    return calculatorEngine.verdictLabel(verdict);
  }

  function metricTile(label, value, extraClass) {
    return '<div class="tile' + (extraClass ? ' ' + extraClass : '') + '">' +
      '<div class="t-label">' + label + '</div>' +
      '<div class="t-value">' + value + '</div></div>';
  }

  function drawDsrGauge(dsr, threshold) {
    var widthPercent = Math.min(100, Math.max(0, dsr * 100));
    return '<div class="gauge"><div class="fill' + (dsr > threshold ? ' over' : '') +
      '" style="width:' + widthPercent + '%"></div></div>' +
      '<div class="gauge-cap"><span>DSR ' + formatPercent(dsr, DSR_DECIMALS) + '</span></div>';
  }

  function numberField(label, inputId, value, options) {
    options = options || {};
    var inputKind = options.fmt;

    if (inputKind == null && !options.text) {
      if (/tenure|years|months|grace/i.test(label)) {
        inputKind = 'int';
      } else if (label.indexOf('(%)') !== -1) {
        inputKind = 'pct';
      } else if (label.indexOf('(RM') !== -1 ||
        /financing|property value|mrtt|valuation|legal|stamping|instal+ment|cost|\bamount\b|\bctf\b|credit limit/i.test(label)) {
        inputKind = 'money';
      }
    }

    var shownValue = inputKind ? CalculatorApp.fmtInput(value, inputKind) : value;

    return '<div class="field"><label>' + label + '</label>' +
      '<input class="editable" type="text"' +
      (inputKind ? ' inputmode="decimal" data-fmt="' + inputKind + '"' : '') +
      ' id="' + inputId + '" value="' + escapeHtml(shownValue) + '"></div>';
  }

  function bindNumberInput(inputId, targetObject, propertyName) {
    var inputElement = getElementById(inputId);
    if (!inputElement) {
      return;
    }
    inputElement.oninput = function () {
      targetObject[propertyName] = this.value;
      CalculatorApp.refreshOutputs();
    };
  }

  function collapsibleCard(cardId, title, bodyHtml) {
    return '<div class="card" id="' + cardId + '">' +
      '<div class="card-head" data-toggle="' + cardId + '">' +
      '<span>' + title + '</span><span class="chev">&#9662;</span></div>' +
      '<div class="card-body">' + bodyHtml + '</div></div>';
  }

  CalculatorApp.today = function () {
    return new Date(Date.now() + 8 * 60 * 60000).toISOString().slice(0, 10);
  };

  /* ---------------- product registry ---------------- */
  CalculatorApp.products = [];

  CalculatorApp.registerProduct = function (product) {
    CalculatorApp.products.push(product);
  };

  CalculatorApp.runSeed = function (productId) {
    CalculatorApp.products.forEach(function (product) {
      if (product.id === productId && product.seed && CalculatorApp[product.seed]) {
        CalculatorApp[product.seed]();
      }
    });
  };

  CalculatorApp.mod = CalculatorApp.mod || {};

  CalculatorApp.mod.ui = {

    formatCurrency: formatCurrency,
    formatAmount: formatAmount,
    formatPercent: formatPercent,
    parseNumber: parseNumber,
    escapeHtml: escapeHtml,
    getElementById: getElementById,
    verdictClass: verdictClass,
    verdictLabel: verdictLabel,
    metricTile: metricTile,
    drawDsrGauge: drawDsrGauge,
    numberField: numberField,
    bindNumberInput: bindNumberInput,
    collapsibleCard: collapsibleCard,
    DSR_DECIMALS: DSR_DECIMALS,

    fmt: formatCurrency,
    amt: formatAmount,
    fmtPct: formatPercent,
    num: parseNumber,
    esc: escapeHtml,
    el: getElementById,
    vClass: verdictClass,
    vLabel: verdictLabel,
    tile: metricTile,
    gauge: drawDsrGauge,
    field: numberField,
    bindNum: bindNumberInput,
    cardShell: collapsibleCard,
    DSR_DP: DSR_DECIMALS
  };
})();
