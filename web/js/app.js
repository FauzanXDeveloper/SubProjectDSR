/* ============================================================
   app.js - shell: hash routing between the 6 modes, sidebar,
   render orchestration, export / print / reset.
   Modes: #/pf #/hf #/cc #/pf-cc #/hf-cc #/pf-hf
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  function el(id) { return document.getElementById(id); }

  var MODES = {
    'pf': 'Personal Financing (PF)',
    'hf': 'Home Financing (HF)',
    'cc': 'Credit Card (CC)',
    'pf-cc': 'Combo: Personal Financing + Credit Card',
    'hf-cc': 'Combo: Home Financing + Credit Card',
    'pf-hf': 'Combo: Personal Financing + Home Financing'
  };

  App.mode = 'pf';

  function currentModeFromHash() {
    var m = (location.hash || '').replace(/^#\/?/, '');
    return MODES[m] ? m : 'pf';
  }

  App.applyMode = function () {
    App.mode = currentModeFromHash();
    el('page-title').textContent = MODES[App.mode];
    document.querySelectorAll('.nav-item[data-mode]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.mode === App.mode);
    });
    var ready = App.computed.intakeReady;
    var showPF = ready && App.mode.indexOf('pf') !== -1;
    var showHF = ready && App.mode.indexOf('hf') !== -1;
    var showCC = ready && App.mode.indexOf('cc') !== -1;
    el('panel-pf').style.display = showPF ? '' : 'none';
    el('panel-hf').style.display = showHF ? '' : 'none';
    el('panel-cc').style.display = showCC ? '' : 'none';
    el('combined-panel').style.display = ready ? '' : 'none';
    el('signoff-panel').style.display = ready ? '' : 'none';
  };

  /** Recompute shared values and update every visible output. */
  App.refreshOutputs = function () {
    App.computeShared();
    App.refreshIntakeOutputs();
    App.applyMode();
    // A joint applicant's own commitment / age / totals must compute even
    // before the main applicant's intake is complete, so refresh those
    // blocks unconditionally on HF pages (they live in the shared card).
    if (App.mode.indexOf('hf') !== -1 && App.refreshHFJointBlocks) App.refreshHFJointBlocks();
    if (App.computed.intakeReady) {
      if (App.mode.indexOf('pf') !== -1) App.refreshPF();
      if (App.mode.indexOf('hf') !== -1) App.refreshHF();
      if (App.mode.indexOf('cc') !== -1) App.refreshCC();
      App.refreshCombined(App.mode);
    } else {
      el('combined-panel').innerHTML = '';
    }
  };

  /** Full re-render (structure + outputs) - after import/reset/mode data swap. */
  App.renderAll = function () {
    App.renderCustomer();
    App.renderCCRIS();
    App.renderIncome();
    App.renderPF();
    App.renderHF();
    App.renderCC();
    App.renderSignoff();
    App.refreshOutputs();
  };

  function init() {
    // The calculator shell may not be in the DOM at all: js/pages/calculator.js
    // replaces document.body with a 403 message when access to a case is
    // denied, but this DOMContentLoaded handler still fires regardless (it's
    // registered by a static <script> tag that always loads). Bail out rather
    // than throwing on the now-missing elements below.
    if (!el('today-date')) return;

    // apply the mode from the URL hash BEFORE the first render, so a page
    // opened (or refreshed) directly on an HF page renders Step A's Product
    // field and Step B's joint applicant blocks straight away
    App.mode = currentModeFromHash();

    // always the Malaysian calendar day, not the browser's zone
    el('today-date').textContent = 'Date: ' + new Date(Db.today() + 'T00:00:00Z').toLocaleDateString('en-MY',
      { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });

    // Some intake data is worth protecting before a mode switch. A switch never
    // deletes data (intake is shared across modes) but the officer may click a
    // sidebar item by accident mid-entry, so confirm when anything is loaded.
    function hasSessionData() {
      var s = App.state;
      return !!(s.customer.name || s.customer.ic || s.iScore ||
        (s.ccris && s.ccris.length) || (s.bt && s.bt.length));
    }
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
            'You have applicant data entered. Your data stays saved for this session - ' +
            'switching only changes which calculator is shown.\n\nSwitch to "' +
            (MODES[target] || target) + '"?',
            { title: 'Change tab?', okLabel: 'Switch tab', cancelLabel: 'Stay here' }
          ).then(function (ok) { if (ok) go(target); });
        } else {
          go(target);
        }
      });
    });
    window.addEventListener('hashchange', function () {
      App.applyMode();
      // Step A shows Product on HF pages (Segment elsewhere); Steps B/C
      // show the HF joint applicant blocks only on HF pages
      App.renderCustomer();
      App.renderCCRIS();
      App.renderIncome();
      App.refreshOutputs();
    });

    el('btn-menu').addEventListener('click', function () {
      el('sidebar').classList.toggle('open');
    });

    // desktop sidebar collapse (icon-only). Persisted so it survives reloads.
    var layout = document.querySelector('.layout');
    function applyCollapsed(on) {
      layout.classList.toggle('sidebar-collapsed', on);
      var b = el('btn-collapse');
      if (b) b.title = on ? 'Expand sidebar' : 'Collapse sidebar';
    }
    try { applyCollapsed(localStorage.getItem('sidebarCollapsed') === '1'); } catch (e) {}
    el('btn-collapse').addEventListener('click', function () {
      var on = !layout.classList.contains('sidebar-collapsed');
      applyCollapsed(on);
      try { localStorage.setItem('sidebarCollapsed', on ? '1' : '0'); } catch (e) {}
    });
    el('btn-print').addEventListener('click', function () {
      if (App.printReport) App.printReport(); else window.print();
    });
    // not rendered when viewing an existing (locked, read-only) case
    var resetBtn = el('btn-reset');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      App.modal.confirm(
        'This clears every field for this session. Export to JSON first if you want to keep it.',
        { title: 'Reset all inputs?', okLabel: 'Reset everything', danger: true }
      ).then(function (ok) {
        if (ok) { App.resetState(); App.renderAll(); }
      });
    });

    App.renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
