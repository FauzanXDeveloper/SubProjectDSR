/* ============================================================
   caseSync.js - bridges the (unchanged) client-side calculator to
   the local JSON database (store/cases.js). Loaded AFTER app.js, so:
     1. the case-resume import below runs synchronously while the
        document is still parsing (before DOMContentLoaded), so
        app.js's own DOMContentLoaded handler (which reads the URL
        hash and calls App.renderAll()) picks up the right mode/state;
     2. the lockdown listener registered below runs AFTER app.js's
        own DOMContentLoaded handler (registered first = fires
        first), so it sees the fully rendered DOM.

   No case data ever touches localStorage here directly - it's read
   fresh from store/cases.js on every page load (window.__DSR_CASE,
   set by js/pages/calculator.js) and written back only via the
   explicit Submit / Approve / Reject / Return / Resubmit / Edit actions
   below, which call
   straight into store/cases.js (no network round trip - there is no
   server).
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

  /* A RETURNED case is in the maker's court by definition - the checker sent
     it back precisely so they could change something - so open it already
     unlocked instead of making them scroll to the sign-off panel and click
     "Edit Case" first. Set before DOMContentLoaded so lockCalculatorInputs()
     below never locks the fields in the first place (no flash of a
     disabled form), and so renderSignoff() shows Save/Resubmit straight away.

     Only for the maker who owns it: the checker reviewing what they sent
     back, and any admin, still get the usual read-only record. A case that
     is still pending_checker also stays read-only until "Edit Case" is
     clicked - that one is sitting in someone else's queue. */
  var viewer = window.__DSR_USER;
  App.caseEditing = !!(window.__DSR_CASE && viewer &&
    window.__DSR_CASE.status === 'returned' && viewer.id === window.__DSR_CASE.makerId);

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

  /** Wraps a synchronous store/cases.js call as a Promise<{ok,...}>,
      matching the shape callers previously got back from fetch(). */
  function wrapSync(fn) {
    try {
      return Promise.resolve(fn());
    } catch (e) {
      return Promise.resolve({ ok: false, error: e.message || String(e) });
    }
  }

  App.submitCaseToChecker = function (checkerId) {
    var snapshot = { state: App.state, computed: App.computed, results: buildResultsSnapshot() };
    return wrapSync(function () {
      var user = Auth.currentUser();
      if (!user) return { ok: false, error: 'Not logged in.' };
      var id = Cases.submit(user.id, checkerId, App.mode, snapshot);
      var caseRow = Cases.find(id);
      return { ok: true, id: id, reference: caseRow.reference };
    });
  };

  App.submitCheckerDecision = function (caseId, decision, notes, signoff) {
    return wrapSync(function () {
      var user = Auth.currentUser();
      if (!user) return { ok: false, error: 'Not logged in.' };
      Cases.decide(caseId, user.id, decision, notes || null, signoff || {});
      return { ok: true };
    });
  };

  /** Checker handing the case back to the maker for amendment instead of
      approving/rejecting it. store/cases.js requires a non-empty comment
      and refuses anything that isn't the checker's own pending case. */
  App.returnCaseToMaker = function (caseId, comment) {
    return wrapSync(function () {
      var user = Auth.currentUser();
      if (!user) return { ok: false, error: 'Not logged in.' };
      Cases.returnToMaker(caseId, user.id, comment);
      return { ok: true };
    });
  };

  /** Maker sending an amended case back to the same checker.
      @param includeSnapshot when true the current on-screen figures are
      saved with the resubmission (and counted as an edit); when false the
      stored payload is left exactly as it is - the maker is only replying,
      not revising, so the "Edited xN" marker stays truthful. */
  App.resubmitCase = function (caseId, comment, includeSnapshot) {
    var snapshot = includeSnapshot
      ? { state: App.state, computed: App.computed, results: buildResultsSnapshot() }
      : null;
    return wrapSync(function () {
      var user = Auth.currentUser();
      if (!user) return { ok: false, error: 'Not logged in.' };
      Cases.resubmit(caseId, user.id, snapshot, comment);
      return { ok: true };
    });
  };

  /** Maker correcting their own still-pending case (typo, checker asked for
      a smaller amount, etc.) - same snapshot shape as submit, just updates
      the existing row instead of inserting a new one. store/cases.js
      enforces ownership and that the case is still pending_checker or
      returned; every edit is counted
      so the "Edited xN" marker stays truthful even if this call is retried. */
  App.updateCase = function (caseId) {
    var snapshot = { state: App.state, computed: App.computed, results: buildResultsSnapshot() };
    return wrapSync(function () {
      var user = Auth.currentUser();
      if (!user) return { ok: false, error: 'Not logged in.' };
      Cases.update(caseId, user.id, snapshot);
      return { ok: true };
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
