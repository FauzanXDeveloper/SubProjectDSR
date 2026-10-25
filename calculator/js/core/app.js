/* ============================================================
   app.js - the calculator shell. Builds the menu from the product
   list, routes between products and combos (#/pf, #/pf-cc, ...),
   runs the render / refresh cycle, and handles print, JSON export
   and import, reset and logout.
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  function el(id) { return document.getElementById(id); }

  var FORMAT = 'dsr-calculator-case';
  var VERSION = 1;
  var ICON_COMBO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="3.5"/><rect x="12" y="12" width="10" height="8" rx="1.5"/><path d="M12 15.5h10"/><path d="M2 20c0-3 2.6-5 6-5"/></svg>';

  App.modes = [];
  App.mode = '';

  App.modeHas = function (mode, id) {
    return String(mode || '').split('-').indexOf(id) !== -1;
  };

  function findMode(key) {
    for (var i = 0; i < App.modes.length; i++) {
      if (App.modes[i].key === key) return App.modes[i];
    }
    return null;
  }

  App.modeLabel = function (key) {
    var m = findMode(key);
    return m ? m.label : key;
  };

  /** Title used on the printed report (no "Combo:" prefix). */
  App.reportLabel = function (key) {
    var m = findMode(key);
    return m ? m.report : key;
  };

  function buildModes() {
    var list = [];
    App.products.forEach(function (p) {
      list.push({ key: p.id, label: p.label, report: p.label, nav: p.label, icon: p.icon, combo: false });
    });
    App.products.forEach(function (a, i) {
      App.products.slice(i + 1).forEach(function (b) {
        list.push({
          key: a.id + '-' + b.id,
          label: 'Combo: ' + a.name + ' + ' + b.name,
          report: a.name + ' + ' + b.name,
          nav: a.short + ' + ' + b.short,
          icon: ICON_COMBO,
          combo: true
        });
      });
    });
    return list;
  }

  function modeFromHash() {
    var m = (location.hash || '').replace(/^#\/?/, '');
    for (var i = 0; i < App.modes.length; i++) {
      if (App.modes[i].key === m) return m;
    }
    return App.products.length ? App.products[0].id : '';
  }

  function hasSessionData() {
    var s = App.state;
    return !!(s.customer.name || s.customer.ic || s.iScore ||
      (s.ccris && s.ccris.length) || (s.bt && s.bt.length));
  }

  App.applyMode = function () {
    App.mode = modeFromHash();
    el('page-title').textContent = App.modeLabel(App.mode);
    document.querySelectorAll('.nav-item[data-mode]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.mode === App.mode);
    });
    var ready = App.computed.intakeReady;
    App.products.forEach(function (p) {
      el(p.panel).style.display = (ready && App.modeHas(App.mode, p.id)) ? '' : 'none';
    });
    el('combined-panel').style.display = ready ? '' : 'none';
  };

  /** Recompute shared values and update every visible output. */
  App.refreshOutputs = function () {
    App.computeShared();
    App.refreshIntakeOutputs();
    App.applyMode();
    // a joint applicant's own figures must compute even before the main
    // applicant's intake is complete, so their hook runs unconditionally
    App.products.forEach(function (p) {
      if (p.preRefresh && App.modeHas(App.mode, p.id) && App[p.preRefresh]) App[p.preRefresh]();
    });
    if (App.computed.intakeReady) {
      App.products.forEach(function (p) {
        if (App.modeHas(App.mode, p.id)) App[p.refresh]();
      });
      App.refreshCombined(App.mode);
    } else {
      el('combined-panel').innerHTML = '';
    }
  };

  /** Full re-render (structure + outputs) - after import / reset / logout. */
  App.renderAll = function () {
    App.renderCustomer();
    App.renderCCRIS();
    App.renderIncome();
    App.products.forEach(function (p) { App[p.render](); });
    App.refreshOutputs();
  };

  function mountPanels() {
    var host = el('product-panels');
    App.products.forEach(function (p) {
      var d = document.createElement('div');
      d.id = p.panel;
      host.appendChild(d);
    });
  }

  function buildNav() {
    function button(m, text) {
      return '<button class="nav-item" data-mode="' + m.key + '" title="' + m.label + '">' +
        m.icon + '<span class="nav-txt">' + text + '</span></button>';
    }
    var singles = App.modes.filter(function (m) { return !m.combo; });
    var combos = App.modes.filter(function (m) { return m.combo; });
    var html = '<div class="group-label">Standalone</div>' +
      singles.map(function (m) { return button(m, m.label); }).join('');
    if (combos.length) {
      html += '<div class="group-label">Combo</div>' +
        combos.map(function (m) { return button(m, m.nav); }).join('');
    }
    el('sidebar-nav-section').innerHTML = html;
  }

  /** Save the current case to a .json file. */
  App.exportCase = function () {
    var user = window.Auth && Auth.current();
    var doc = {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: user ? user.name : '',
      mode: App.mode,
      state: App.state
    };
    var who = String(App.state.customer.name || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    var file = 'DSR-' + (who || 'case') + '-' + App.today() + '.json';
    var blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  };

  /** Load a case from the text of an exported .json file. */
  App.loadCase = function (text) {
    var doc = null;
    try { doc = JSON.parse(text); } catch (e) { doc = null; }
    if (!doc || doc.format !== FORMAT || !doc.state || typeof doc.state !== 'object') {
      App.modal.alert('This file is not a DSR calculator case file.', { type: 'error' });
      return;
    }
    function apply() {
      App.importJSON(doc.state);
      var target = App.modes.some(function (m) { return m.key === doc.mode; }) ? doc.mode : null;
      if (target && (location.hash || '').replace(/^#\/?/, '') !== target) {
        location.hash = '#/' + target;
      }
      App.renderAll();
    }
    if (hasSessionData()) {
      App.modal.confirm('Replace the current case with the one in this file?',
        { title: 'Load case?', okLabel: 'Load case', danger: true }
      ).then(function (ok) { if (ok) apply(); });
    } else {
      apply();
    }
  };

  App.logout = function () {
    Auth.logout();
    App.resetState();
    App.renderAll();
    Auth.showGate();
  };

  function init() {
    App.modes = buildModes();
    App.mode = modeFromHash();

    el('today-date').textContent = 'Date: ' + new Date(App.today() + 'T00:00:00Z').toLocaleDateString('en-MY',
      { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });

    mountPanels();
    buildNav();

    function go(mode) {
      location.hash = '#/' + mode;
      el('sidebar').classList.remove('open');
    }
    document.querySelectorAll('.nav-item[data-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.dataset.mode;
        if (target === App.mode) { el('sidebar').classList.remove('open'); return; }
        if (hasSessionData()) {
          App.modal.confirm(
            'You have applicant data entered. It stays in this session - ' +
            'switching only changes which calculator is shown.\n\nSwitch to "' +
            App.modeLabel(target) + '"?',
            { title: 'Change tab?', okLabel: 'Switch tab', cancelLabel: 'Stay here' }
          ).then(function (ok) { if (ok) go(target); });
        } else {
          go(target);
        }
      });
    });

    window.addEventListener('hashchange', function () {
      App.applyMode();
      App.renderCustomer();
      App.renderCCRIS();
      App.renderIncome();
      App.refreshOutputs();
    });

    el('btn-menu').addEventListener('click', function () {
      el('sidebar').classList.toggle('open');
    });

    var layout = document.querySelector('.layout');
    el('btn-collapse').addEventListener('click', function () {
      var on = layout.classList.toggle('sidebar-collapsed');
      el('btn-collapse').title = on ? 'Expand sidebar' : 'Collapse sidebar';
    });

    // phone / tablet: the sidebar is a drawer - tap the page or press Escape to close it
    document.querySelector('.main').addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('#btn-menu')) return;
      el('sidebar').classList.remove('open');
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') el('sidebar').classList.remove('open');
    });
    // a sidebar collapsed on a desktop window must not come back as a
    // 60px-wide drawer once the window is narrow
    window.addEventListener('resize', function () {
      if (window.innerWidth <= 900) layout.classList.remove('sidebar-collapsed');
    });
    if (window.innerWidth <= 900) layout.classList.remove('sidebar-collapsed');

    el('btn-print').addEventListener('click', function () { App.printReport(); });
    el('btn-export').addEventListener('click', function () { App.exportCase(); });
    el('btn-import').addEventListener('click', function () { el('import-file').click(); });
    el('import-file').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { App.loadCase(String(reader.result)); };
      reader.readAsText(f);
    });

    el('btn-reset').addEventListener('click', function () {
      App.modal.confirm(
        'This clears every field for this session. Export to JSON first if you want to keep it.',
        { title: 'Reset all inputs?', okLabel: 'Reset everything', danger: true }
      ).then(function (ok) {
        if (ok) { App.resetState(); App.renderAll(); }
      });
    });

    el('calc-logout').addEventListener('click', function (ev) {
      ev.preventDefault();
      App.logout();
    });

    App.renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
