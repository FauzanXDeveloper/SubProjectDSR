/* ---------------- popups ---------------- */

(function () {
  'use strict';

  var CalculatorApp = window.App = window.App || {};

  var ICON_PATHS = {
    info: 'M12 8h.01M11 12h1v4h1',
    success: 'M8 12.5l2.5 2.5 5-5.5',
    warn: 'M12 9v4M12 16.5h.01',
    error: 'M9.5 9.5l5 5M14.5 9.5l-5 5'
  };

  var modalRoot = null;
  var activeModal = null;
  var lastFocusedElement = null;

  function buildModalRoot() {
    modalRoot = document.createElement('div');
    modalRoot.className = 'modal-root';
    modalRoot.setAttribute('aria-hidden', 'true');

    modalRoot.innerHTML =
      '<div class="modal-backdrop"></div>' +
      '<div class="modal-card" role="alertdialog" aria-modal="true" tabindex="-1">' +
        '<div class="modal-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/>' +
          '<path class="modal-glyph" d=""/></svg></div>' +
        '<h2 class="modal-title" id="modal-title"></h2>' +
        '<p class="modal-msg" id="modal-msg"></p>' +
        '<div class="modal-actions"></div>' +
      '</div>';

    document.body.appendChild(modalRoot);

    modalRoot.querySelector('.modal-backdrop').addEventListener('click', function () {
      if (activeModal && activeModal.dismissable) {
        closeModal(activeModal.cancelValue);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (!activeModal) {
        return;
      }

      if (event.key === 'Escape' && activeModal.dismissable) {
        event.preventDefault();
        closeModal(activeModal.cancelValue);
        return;
      }

      if (event.key === 'Enter') {
        var defaultButton = modalRoot.querySelector('.modal-actions .btn.is-default');
        if (defaultButton) {
          event.preventDefault();
          defaultButton.click();
        }
      }
    });
  }

  function closeModal(resultValue) {
    if (!activeModal) {
      return;
    }

    var resolvePromise = activeModal.resolve;
    activeModal = null;

    modalRoot.classList.remove('open');
    modalRoot.setAttribute('aria-hidden', 'true');

    setTimeout(function () {
      if (!activeModal) {
        modalRoot.style.display = 'none';
      }
      if (lastFocusedElement && lastFocusedElement.focus) {
        try { lastFocusedElement.focus(); } catch (error) {  }
      }
    }, 160);

    resolvePromise(resultValue);
  }

  function defaultTitleForType(type) {
    if (type === 'success') return 'Done';
    if (type === 'warn') return 'Please check';
    if (type === 'error') return 'There is a problem';
    return 'Notice';
  }

  function openModal(options) {
    options = options || {};

    if (!modalRoot) {
      buildModalRoot();
    }

    if (activeModal) {
      var previousModal = activeModal;
      activeModal = null;
      previousModal.resolve(previousModal.cancelValue);
    }

    var modalType = ICON_PATHS[options.type] ? options.type : 'info';

    var buttons = options.buttons && options.buttons.length
      ? options.buttons
      : [{ label: 'OK', value: true, variant: 'primary', default: true }];

    var cancelButton = null;
    for (var index = 0; index < buttons.length; index++) {
      if (buttons[index].cancel) {
        cancelButton = buttons[index];
        break;
      }
    }

    var card = modalRoot.querySelector('.modal-card');
    card.className = 'modal-card type-' + modalType;
    modalRoot.querySelector('.modal-glyph').setAttribute('d', ICON_PATHS[modalType]);
    modalRoot.querySelector('.modal-title').textContent = options.title || defaultTitleForType(modalType);

    var messageElement = modalRoot.querySelector('.modal-msg');
    messageElement.textContent = options.message || '';
    messageElement.style.display = options.message ? '' : 'none';

    var actionsArea = modalRoot.querySelector('.modal-actions');
    actionsArea.innerHTML = '';

    var resultPromise = new Promise(function (resolve) {
      activeModal = {
        resolve: resolve,
        dismissable: options.dismissable !== false,
        cancelValue: cancelButton
          ? cancelButton.value
          : (options.cancelValue !== undefined ? options.cancelValue : false)
      };

      buttons.forEach(function (buttonOptions) {
        var buttonElement = document.createElement('button');
        buttonElement.type = 'button';
        buttonElement.className = 'btn' +
          (buttonOptions.variant === 'secondary' ? ' secondary' :
            buttonOptions.variant === 'danger' ? ' danger' : '') +
          (buttonOptions.default ? ' is-default' : '');
        buttonElement.textContent = buttonOptions.label;
        buttonElement.addEventListener('click', function () {
          closeModal(buttonOptions.value);
        });
        actionsArea.appendChild(buttonElement);
      });
    });

    lastFocusedElement = document.activeElement;
    modalRoot.style.display = '';
    modalRoot.setAttribute('aria-hidden', 'false');

    requestAnimationFrame(function () {
      modalRoot.classList.add('open');
      var focusTarget = actionsArea.querySelector('.btn.is-default') ||
        actionsArea.querySelector('.btn');
      if (focusTarget && focusTarget.focus) {
        try { focusTarget.focus(); } catch (error) {  }
      }
    });

    return resultPromise;
  }

  function showAlert(message, options) {
    options = options || {};
    return openModal({
      type: options.type || 'info',
      title: options.title,
      message: message,
      buttons: [{ label: options.okLabel || 'OK', value: true, variant: 'primary', default: true }]
    });
  }

  function showConfirm(message, options) {
    options = options || {};
    return openModal({
      type: options.type || 'warn',
      title: options.title,
      message: message,
      buttons: [
        { label: options.cancelLabel || 'Cancel', value: false, variant: 'secondary', cancel: true },
        {
          label: options.okLabel || 'Confirm',
          value: true,
          variant: options.danger ? 'danger' : 'primary',
          default: true
        }
      ]
    });
  }

  CalculatorApp.modal = {
    open: openModal,
    alert: showAlert,
    confirm: showConfirm,
    close: function () {
      closeModal(activeModal && activeModal.cancelValue);
    }
  };
})();
