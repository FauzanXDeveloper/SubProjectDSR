/* ---------------- app shell ---------------- */

(function () {
  'use strict';

  var CalculatorApp = window.App = window.App || {};

  var CASE_FILE_FORMAT = 'dsr-calculator-case';
  var CASE_FILE_VERSION = 1;

  var COMBO_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<circle cx="8" cy="8" r="3.5"/><rect x="12" y="12" width="10" height="8" rx="1.5"/>' +
    '<path d="M12 15.5h10"/><path d="M2 20c0-3 2.6-5 6-5"/></svg>';

  CalculatorApp.modes = [];
  CalculatorApp.mode = '';

  CalculatorApp.modeHas = function (mode, productId) {
    var modeParts = String(mode || '').split('-');
    return modeParts.indexOf(productId) !== -1;
  };

  function findMode(modeKey) {
    for (var index = 0; index < CalculatorApp.modes.length; index++) {
      if (CalculatorApp.modes[index].key === modeKey) {
        return CalculatorApp.modes[index];
      }
    }
    return null;
  }

  CalculatorApp.modeLabel = function (modeKey) {
    var mode = findMode(modeKey);
    return mode ? mode.label : modeKey;
  };

  CalculatorApp.reportLabel = function (modeKey) {
    var mode = findMode(modeKey);
    return mode ? mode.report : modeKey;
  };

  function buildModes() {
    var modeList = [];

    CalculatorApp.products.forEach(function (product) {
      modeList.push({
        key: product.id,
        label: product.label,
        report: product.label,
        nav: product.label,
        icon: product.icon,
        combo: false
      });
    });

    CalculatorApp.products.forEach(function (firstProduct, firstIndex) {
      CalculatorApp.products.slice(firstIndex + 1).forEach(function (secondProduct) {
        modeList.push({
          key: firstProduct.id + '-' + secondProduct.id,
          label: 'Combo: ' + firstProduct.name + ' + ' + secondProduct.name,
          report: firstProduct.name + ' + ' + secondProduct.name,
          nav: firstProduct.short + ' + ' + secondProduct.short,
          icon: COMBO_ICON,
          combo: true
        });
      });
    });

    return modeList;
  }

  function getModeFromHash() {
    var hashMode = (location.hash || '').replace(/^#\/?/, '');

    for (var index = 0; index < CalculatorApp.modes.length; index++) {
      if (CalculatorApp.modes[index].key === hashMode) {
        return hashMode;
      }
    }

    return CalculatorApp.products.length ? CalculatorApp.products[0].id : '';
  }

  function hasEnteredCaseData() {
    var calculatorState = CalculatorApp.state;

    return !!(
      calculatorState.customer.name ||
      calculatorState.customer.ic ||
      calculatorState.iScore ||
      (calculatorState.ccris && calculatorState.ccris.length) ||
      (calculatorState.bt && calculatorState.bt.length)
    );
  }

  CalculatorApp.applyMode = function () {
    CalculatorApp.mode = getModeFromHash();

    document.getElementById('page-title').textContent = CalculatorApp.modeLabel(CalculatorApp.mode);

    document.querySelectorAll('.nav-item[data-mode]').forEach(function (navButton) {
      var isCurrentMode = navButton.dataset.mode === CalculatorApp.mode;
      navButton.classList.toggle('active', isCurrentMode);
    });

    var intakeIsReady = CalculatorApp.computed.intakeReady;

    CalculatorApp.products.forEach(function (product) {
      var shouldShow = intakeIsReady && CalculatorApp.modeHas(CalculatorApp.mode, product.id);
      document.getElementById(product.panel).style.display = shouldShow ? '' : 'none';
    });

    document.getElementById('combined-panel').style.display = intakeIsReady ? '' : 'none';
  };

  CalculatorApp.refreshOutputs = function () {

    if (CalculatorApp.syncBtLinks) {
      CalculatorApp.syncBtLinks();
    }

    CalculatorApp.computeShared();
    CalculatorApp.refreshIntakeOutputs();
    CalculatorApp.applyMode();

    CalculatorApp.products.forEach(function (product) {
      var hookName = product.preRefresh;
      if (hookName && CalculatorApp.modeHas(CalculatorApp.mode, product.id) && CalculatorApp[hookName]) {
        CalculatorApp[hookName]();
      }
    });

    if (CalculatorApp.computed.intakeReady) {
      CalculatorApp.products.forEach(function (product) {
        if (CalculatorApp.modeHas(CalculatorApp.mode, product.id)) {
          CalculatorApp[product.refresh]();
        }
      });

      CalculatorApp.refreshCombined(CalculatorApp.mode);
    } else {
      document.getElementById('combined-panel').innerHTML = '';
    }
  };

  CalculatorApp.renderAll = function () {
    CalculatorApp.renderCustomer();
    CalculatorApp.renderCCRIS();
    CalculatorApp.renderIncome();

    CalculatorApp.products.forEach(function (product) {
      CalculatorApp[product.render]();
    });

    CalculatorApp.refreshOutputs();
  };

  function mountProductPanels() {
    var panelHost = document.getElementById('product-panels');

    CalculatorApp.products.forEach(function (product) {
      var panel = document.createElement('div');
      panel.id = product.panel;
      panelHost.appendChild(panel);
    });
  }

  /* ---------------- navigation ---------------- */
function buildNavigation() {
    function makeButton(mode, buttonText) {
      return '<button class="nav-item" data-mode="' + mode.key + '" title="' + mode.label + '">' +
        mode.icon + '<span class="nav-txt">' + buttonText + '</span></button>';
    }

    var standaloneModes = CalculatorApp.modes.filter(function (mode) { return !mode.combo; });
    var combos = CalculatorApp.modes.filter(function (mode) { return mode.combo; });

    var navHtml = '<div class="group-label">Standalone</div>' +
      standaloneModes.map(function (mode) {
        return makeButton(mode, mode.label);
      }).join('');

    if (combos.length) {
      navHtml += '<div class="group-label">Combo</div>' +
        combos.map(function (mode) {
          return makeButton(mode, mode.nav);
        }).join('');
    }

    document.getElementById('sidebar-nav-section').innerHTML = navHtml;
  }

  /* ---------------- case files ---------------- */
function getModeFileSuffix(mode) {
    var modeText = String(mode || '');
    if (!modeText) {
      return 'Case';
    }

    var modeParts = modeText.split('-').map(function (part) {
      return part.toUpperCase();
    });

    var prefix = modeParts.length > 1 ? 'Combo_' : '';
    return prefix + modeParts.join('+');
  }

  CalculatorApp.exportCase = function () {
    var currentUser = window.Auth && Auth.current();

    var caseFile = {
      format: CASE_FILE_FORMAT,
      version: CASE_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser ? currentUser.name : '',
      mode: CalculatorApp.mode,
      state: CalculatorApp.state
    };

    var customerName = String(CalculatorApp.state.customer.name || '').trim()
      .replace(/[^A-Za-z0-9 _-]+/g, '')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '');

    var fileName = 'DSR_' + (customerName || 'case') + '_' +
      getModeFileSuffix(CalculatorApp.mode) + '.json';

    var fileBlob = new Blob([JSON.stringify(caseFile, null, 2)], { type: 'application/json' });
    var fileUrl = URL.createObjectURL(fileBlob);
    var downloadLink = document.createElement('a');

    downloadLink.href = fileUrl;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();

    setTimeout(function () {
      URL.revokeObjectURL(fileUrl);
      downloadLink.remove();
    }, 1000);
  };

  function resetEditModes() {
    CalculatorApp.incomeEditMode = false;
    CalculatorApp.ccrisEditIdx = null;
    CalculatorApp.ccrisEditSnapshot = null;

    if (CalculatorApp.hfJointEditIdx) {
      CalculatorApp.hfJointEditIdx.A = null;
      CalculatorApp.hfJointEditIdx.B = null;
    }

    if (CalculatorApp.hfJointEditSnapshot) {
      CalculatorApp.hfJointEditSnapshot.A = null;
      CalculatorApp.hfJointEditSnapshot.B = null;
    }

    if (CalculatorApp.hfJointIncomeEdit) {
      CalculatorApp.hfJointIncomeEdit.A = false;
      CalculatorApp.hfJointIncomeEdit.B = false;
    }
  }

  CalculatorApp.loadCase = function (fileText) {
    var parsedCaseFile = null;

    try {
      parsedCaseFile = JSON.parse(fileText);
    } catch (error) {
      parsedCaseFile = null;
    }

    var isOurFile = parsedCaseFile &&
      parsedCaseFile.format === CASE_FILE_FORMAT &&
      parsedCaseFile.state &&
      typeof parsedCaseFile.state === 'object';

    if (!isOurFile) {
      CalculatorApp.modal.alert('This file is not a DSR calculator case file.', { type: 'error' });
      return;
    }

    function applyCaseFile() {
      resetEditModes();
      CalculatorApp.importJSON(parsedCaseFile.state);

      var modeExists = CalculatorApp.modes.some(function (mode) {
        return mode.key === parsedCaseFile.mode;
      });

      if (modeExists) {
        var currentHashMode = (location.hash || '').replace(/^#\/?/, '');
        if (currentHashMode !== parsedCaseFile.mode) {
          location.hash = '#/' + parsedCaseFile.mode;
        }
      }

      CalculatorApp.renderAll();
    }

    if (hasEnteredCaseData()) {
      CalculatorApp.modal.confirm(
        'Replace the current case with the one in this file?',
        { title: 'Load case?', okLabel: 'Load case', danger: true }
      ).then(function (confirmed) {
        if (confirmed) {
          applyCaseFile();
        }
      });
    } else {
      applyCaseFile();
    }
  };

  CalculatorApp.logout = function () {
    Auth.logout();
    resetEditModes();
    CalculatorApp.resetState();
    CalculatorApp.renderAll();
    Auth.showGate();
  };

  function init() {
    CalculatorApp.modes = buildModes();
    CalculatorApp.mode = getModeFromHash();

    document.getElementById('today-date').textContent = 'Date: ' +
      new Date(CalculatorApp.today() + 'T00:00:00Z').toLocaleDateString('en-MY', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
      });

    mountProductPanels();
    buildNavigation();

    function goToMode(modeKey) {
      location.hash = '#/' + modeKey;
      document.getElementById('sidebar').classList.remove('open');
    }

    document.querySelectorAll('.nav-item[data-mode]').forEach(function (navButton) {
      navButton.addEventListener('click', function () {
        var targetMode = navButton.dataset.mode;

        if (targetMode === CalculatorApp.mode) {
          document.getElementById('sidebar').classList.remove('open');
          return;
        }

        if (hasEnteredCaseData()) {
          CalculatorApp.modal.confirm(
            'You have applicant data entered. It stays in this session - ' +
            'switching only changes which calculator is shown.\n\nSwitch to "' +
            CalculatorApp.modeLabel(targetMode) + '"?',
            { title: 'Change tab?', okLabel: 'Switch tab', cancelLabel: 'Stay here' }
          ).then(function (confirmed) {
            if (confirmed) {
              goToMode(targetMode);
            }
          });
        } else {
          goToMode(targetMode);
        }
      });
    });

    window.addEventListener('hashchange', function () {
      CalculatorApp.applyMode();
      CalculatorApp.renderCustomer();
      CalculatorApp.renderCCRIS();
      CalculatorApp.renderIncome();

      CalculatorApp.products.forEach(function (product) {
        CalculatorApp[product.render]();
      });

      CalculatorApp.refreshOutputs();
    });

    document.getElementById('btn-menu').addEventListener('click', function () {
      document.getElementById('sidebar').classList.toggle('open');
    });

    var layoutElement = document.querySelector('.layout');

    document.getElementById('btn-collapse').addEventListener('click', function () {
      var isCollapsed = layoutElement.classList.toggle('sidebar-collapsed');
      document.getElementById('btn-collapse').title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
    });

    document.querySelector('.main').addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('#btn-menu')) {
        return;
      }
      document.getElementById('sidebar').classList.remove('open');
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        document.getElementById('sidebar').classList.remove('open');
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth <= 900) {
        layoutElement.classList.remove('sidebar-collapsed');
      }
    });

    if (window.innerWidth <= 900) {
      layoutElement.classList.remove('sidebar-collapsed');
    }

    document.getElementById('btn-print').addEventListener('click', function () {
      CalculatorApp.printReport();
    });

    document.getElementById('btn-export').addEventListener('click', function () {
      CalculatorApp.exportCase();
    });

    document.getElementById('btn-import').addEventListener('click', function () {
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', function (event) {
      var selectedFile = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!selectedFile) {
        return;
      }

      var fileReader = new FileReader();
      fileReader.onload = function () {
        CalculatorApp.loadCase(String(fileReader.result));
      };
      fileReader.readAsText(selectedFile);
    });

    document.getElementById('btn-reset').addEventListener('click', function () {
      CalculatorApp.modal.confirm(
        'This clears every field for this session. Export to JSON first if you want to keep it.',
        { title: 'Reset all inputs?', okLabel: 'Reset everything', danger: true }
      ).then(function (confirmed) {
        if (confirmed) {
          resetEditModes();
          CalculatorApp.resetState();
          CalculatorApp.renderAll();
        }
      });
    });

    document.getElementById('calc-logout').addEventListener('click', function (event) {
      event.preventDefault();
      CalculatorApp.logout();
    });

    CalculatorApp.renderAll();

    function getInputSignature() {
      var sectionIds = ['intake-customer', 'intake-ccris', 'intake-income', 'product-panels', 'signoff-panel'];
      var signatureParts = [];

      sectionIds.forEach(function (sectionId) {
        var section = document.getElementById(sectionId);
        if (!section) {
          return;
        }

        section.querySelectorAll('input, select, textarea').forEach(function (input) {
          if (input.type === 'file' || input.type === 'hidden') {
            return;
          }
          signatureParts.push(input.id || input.name || '', input.value);
        });
      });

      return signatureParts.join('|');
    }

    var blankInputSignature = getInputSignature();

    function dropBrowserRestoredValues() {
      if (hasEnteredCaseData()) {
        return;
      }
      if (getInputSignature() === blankInputSignature) {
        return;
      }
      CalculatorApp.renderAll();
    }

    window.addEventListener('pageshow', function () {
      setTimeout(dropBrowserRestoredValues, 0);
      setTimeout(dropBrowserRestoredValues, 400);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
