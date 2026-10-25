/* ============================================================
   modal.js - one centered, on-brand popup for every message.
   Replaces the browser's window.alert / window.confirm (which
   render top-left, unstyled, and cannot be branded).

   Promise-based so a confirm reads naturally:
     App.modal.confirm('Delete this?').then(function (ok) { ... });
     App.modal.alert('Saved.', { type: 'success' });
     App.modal.open({ type, title, message, buttons: [...] });

   type: 'info' | 'success' | 'warn' | 'error' (sets icon + accent).
   `message` is treated as PLAIN TEXT (newlines preserved) so
   customer names lifted from a PDF can never inject markup.
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  var ICONS = {
    info:    'M12 8h.01M11 12h1v4h1',
    success: 'M8 12.5l2.5 2.5 5-5.5',
    warn:    'M12 9v4M12 16.5h.01',
    error:   'M9.5 9.5l5 5M14.5 9.5l-5 5'
  };

  var root = null, current = null;

  function build() {
    root = document.createElement('div');
    root.className = 'modal-root';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML =
      '<div class="modal-backdrop"></div>' +
      '<div class="modal-card" role="alertdialog" aria-modal="true" tabindex="-1">' +
        '<div class="modal-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/>' +
          '<path class="modal-glyph" d=""/></svg></div>' +
        '<h2 class="modal-title" id="modal-title"></h2>' +
        '<p class="modal-msg" id="modal-msg"></p>' +
        '<div class="modal-actions"></div>' +
      '</div>';
    document.body.appendChild(root);
    // dismiss by backdrop click or Escape -> resolves the cancel value
    root.querySelector('.modal-backdrop').addEventListener('click', function () {
      if (current && current.dismissable) close(current.cancelValue);
    });
    document.addEventListener('keydown', function (ev) {
      if (!current) return;
      if (ev.key === 'Escape' && current.dismissable) { ev.preventDefault(); close(current.cancelValue); }
      else if (ev.key === 'Enter') {
        var def = root.querySelector('.modal-actions .btn.is-default');
        if (def) { ev.preventDefault(); def.click(); }
      }
    });
  }

  function close(value) {
    if (!current) return;
    var resolve = current.resolve;
    current = null;
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    // let the fade-out play before hiding, and restore focus
    var last = root._lastFocus;
    setTimeout(function () {
      if (!current) root.style.display = 'none';
      if (last && last.focus) { try { last.focus(); } catch (e) {} }
    }, 160);
    resolve(value);
  }

  /** Open the popup. buttons: [{ label, value, variant, default }].
      Returns a Promise resolving to the chosen button's value (or the
      cancel value on backdrop/Escape). */
  function open(opts) {
    opts = opts || {};
    if (!root) build();
    // if one is already open, resolve it as cancelled first
    if (current) { var c = current; current = null; c.resolve(c.cancelValue); }

    var type = ICONS[opts.type] ? opts.type : 'info';
    var buttons = opts.buttons && opts.buttons.length ? opts.buttons
      : [{ label: 'OK', value: true, variant: 'primary', default: true }];
    var cancelBtn = null;
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].cancel) { cancelBtn = buttons[i]; break; }
    }

    var card = root.querySelector('.modal-card');
    card.className = 'modal-card type-' + type;
    root.querySelector('.modal-glyph').setAttribute('d', ICONS[type]);
    root.querySelector('.modal-title').textContent = opts.title || defaultTitle(type);
    var msgEl = root.querySelector('.modal-msg');
    msgEl.textContent = opts.message || '';         // plain text; CSS keeps \n
    msgEl.style.display = opts.message ? '' : 'none';

    var actions = root.querySelector('.modal-actions');
    actions.innerHTML = '';
    var promise = new Promise(function (resolve) {
      current = {
        resolve: resolve,
        dismissable: opts.dismissable !== false,
        cancelValue: cancelBtn ? cancelBtn.value : (opts.cancelValue !== undefined ? opts.cancelValue : false)
      };
      buttons.forEach(function (b) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn' + (b.variant === 'secondary' ? ' secondary' :
          b.variant === 'danger' ? ' danger' : '') + (b.default ? ' is-default' : '');
        btn.textContent = b.label;
        btn.addEventListener('click', function () { close(b.value); });
        actions.appendChild(btn);
      });
    });

    root._lastFocus = document.activeElement;
    root.style.display = '';
    root.setAttribute('aria-hidden', 'false');
    // next frame so the CSS transition runs from the hidden state
    requestAnimationFrame(function () {
      root.classList.add('open');
      var def = actions.querySelector('.btn.is-default') || actions.querySelector('.btn');
      if (def && def.focus) { try { def.focus(); } catch (e) {} }
    });
    return promise;
  }

  function defaultTitle(type) {
    return type === 'success' ? 'Done' : type === 'warn' ? 'Please check' :
           type === 'error' ? 'There is a problem' : 'Notice';
  }

  function alert(message, opts) {
    opts = opts || {};
    return open({
      type: opts.type || 'info', title: opts.title, message: message,
      buttons: [{ label: opts.okLabel || 'OK', value: true, variant: 'primary', default: true }]
    });
  }

  function confirm(message, opts) {
    opts = opts || {};
    return open({
      type: opts.type || 'warn', title: opts.title, message: message,
      buttons: [
        { label: opts.cancelLabel || 'Cancel', value: false, variant: 'secondary', cancel: true },
        { label: opts.okLabel || 'Confirm', value: true,
          variant: opts.danger ? 'danger' : 'primary', default: true }
      ]
    });
  }

  App.modal = { open: open, alert: alert, confirm: confirm, close: function () { close(current && current.cancelValue); } };
})();
