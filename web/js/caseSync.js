/* ============================================================
   caseSync.js - bridges the (unchanged) client-side calculator to
   the PHP/DB backend. Loaded AFTER app.js, so:
     1. the case-resume import below runs synchronously while the
        document is still parsing (before DOMContentLoaded), so
        app.js's own DOMContentLoaded handler (which reads the URL
        hash and calls App.renderAll()) picks up the right mode/state;
     2. the lockdown listener registered below runs AFTER app.js's
        own DOMContentLoaded handler (registered first = fires
        first), so it sees the fully rendered DOM.

   No case data ever touches localStorage/sessionStorage here - it
   is fetched fresh from the server on every page load (window.
   __DSR_CASE, injected by web/index.php) and pushed back only via
   the explicit Submit / Approve / Reject actions below.
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  // ---- resume an existing case (view/decide) ----
  if (window.__DSR_CASE && window.__DSR_CASE.state) {
    App.importJSON(window.__DSR_CASE.state);
    if (window.__DSR_CASE.mode) {
      location.hash = '#/' + window.__DSR_CASE.mode;
    }
  }

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: 'Unexpected server response.' }; });
    }).catch(function () {
      return { ok: false, error: 'Network error - check your connection and try again.' };
    });
  }

  /** Build the {verdict, dsr, ndi, commitment} snapshot from the same
      combined-decision object the on-screen banner already uses
      (App.combinedDecisionData, js/panels.js) - no engine math duplicated. */
  function buildResultsSnapshot() {
    var d = App.combinedDecisionData(App.mode);
    if (!d) return {};
    if (d.kind === 'per-applicant') {
      var rows = d.rows || [];
      var main = rows.filter(function (r) { return r.key === 'MAIN'; })[0] || rows[0] || {};
      var allOk = rows.length > 0 && rows.every(function (r) { return r.ok; });
      return {
        verdict: allOk ? 'APPROVED' : 'REJECTED',
        dsr: main.dsr || 0,
        ndi: (main.net || 0) - (main.commit || 0),
        commitment: main.commit || 0
      };
    }
    return {
      verdict: window.Engine.verdictLabel(d.verdict) || '',
      dsr: d.dsr || 0,
      ndi: d.ndi || 0,
      commitment: d.commitment || 0
    };
  }

  App.submitCaseToChecker = function (checkerId) {
    var snapshot = { state: App.state, computed: App.computed, results: buildResultsSnapshot() };
    return postJSON('/api/case_submit.php', {
      csrf: window.__DSR_CSRF, mode: App.mode, checker_id: checkerId, snapshot: snapshot
    });
  };

  App.submitCheckerDecision = function (caseId, decision, notes, signoff) {
    return postJSON('/api/checker_decision.php', {
      csrf: window.__DSR_CSRF, case_id: caseId, decision: decision, notes: notes, signoff: signoff || {}
    });
  };

  /** Maker correcting their own still-pending case (typo, checker asked for
      a smaller amount, etc.) - same snapshot shape as submit, just PATCHes
      the existing row instead of inserting a new one. Server enforces
      ownership + pending_checker status; every edit is counted server-side
      so the "Edited xN" marker stays truthful even if this call is retried. */
  App.updateCase = function (caseId) {
    var snapshot = { state: App.state, computed: App.computed, results: buildResultsSnapshot() };
    return postJSON('/api/case_update.php', {
      csrf: window.__DSR_CSRF, case_id: caseId, snapshot: snapshot
    });
  };

  // ---- lock every field once viewing an existing case; the sign-off
  // panel renders its own (separately gated) decision controls, so this
  // never touches #signoff-panel. Suspended while App.caseEditing is true
  // (see panels.js "Edit Case" button) - App.renderAll() there rebuilds
  // every panel from scratch, so skipping the lock here is enough to leave
  // the fresh markup interactive. ----
  function lockCalculatorInputs() {
    if (!window.__DSR_CASE || App.caseEditing) return;
    ['intake-customer', 'intake-ccris', 'intake-income', 'panel-pf', 'panel-hf', 'panel-cc'].forEach(function (id) {
      var root = document.getElementById(id);
      if (!root) return;
      root.querySelectorAll('input,select,textarea,button').forEach(function (elx) { elx.disabled = true; });
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (!window.__DSR_CASE) return;
    lockCalculatorInputs();
    window.addEventListener('hashchange', function () { setTimeout(lockCalculatorInputs, 0); });
  });
})();
