/* ============================================================
   calculator.js - boot script for the calculator shell (index.html).
   Replaces the PHP half of web/index.php: works out what to show
   (blank calculator / resume-a-case / 403), fills the placeholders
   left in index.html, and sets the same window.__DSR_* globals the
   PHP page used to inject (still read directly by js/panels.js and
   js/report.js).

   This must run as a plain static <script> tag BEFORE the engine/app
   <script> tags later in index.html (not dynamically injected): it
   needs to finish synchronously so window.__DSR_* and the DOM
   placeholders are ready before config.js/app.js run, and app.js /
   caseSync.js each rely on the document's single 'DOMContentLoaded'
   event, which must not fire until every one of those tags has
   loaded.
   ============================================================ */
(function () {
  'use strict';

  var user = Auth.requireLogin();
  if (!user) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var params = new URLSearchParams(location.search);
  var caseId = parseInt(params.get('case'), 10) || 0;
  var caseRow = null;

  if (caseId) {
    caseRow = Cases.find(caseId);
    if (!caseRow || !Cases.canView(caseRow, user)) {
      document.body.innerHTML =
        '<div style="padding:60px 24px;font:15px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;' +
        'max-width:480px;margin:0 auto;text-align:center;color:#1b2733">' +
        '<h1 style="font-size:20px;margin-bottom:8px">403 &mdash; Forbidden</h1>' +
        '<p>You do not have access to that case.</p>' +
        '<p><a href="/dashboard.html">Back to dashboard</a></p></div>';
      return;
    }
  } else if (user.role === 'admin') {
    // admins review submitted cases (read-only, via a case link) but don't
    // run the calculator themselves - that's the maker's job
    location.href = '/dashboard.html';
    return;
  }

  var injectedCase = null;
  if (caseRow) {
    var payload = caseRow.payload || {};
    var checkerName = null;
    if (caseRow.assigned_checker_id) {
      var db = Db.load();
      var checkerUser = db.users.filter(function (u) { return u.id === caseRow.assigned_checker_id; })[0];
      checkerName = checkerUser ? checkerUser.name : null;
    }
    injectedCase = {
      id: caseRow.id,
      reference: caseRow.reference,
      status: caseRow.status,
      mode: caseRow.mode,
      state: payload.state || {},
      makerId: caseRow.created_by,
      checkerName: checkerName,
      decidedAt: caseRow.decided_at,
      decisionNotes: caseRow.decision_notes,
      editCount: caseRow.edit_count || 0,
      editedAt: caseRow.edited_at,
      returnCount: caseRow.return_count || 0,
      returnedAt: caseRow.returned_at,
      returnNotes: caseRow.return_notes,
      comments: Array.isArray(caseRow.comments) ? caseRow.comments : []
    };
  }

  // only relevant when a maker is starting a brand-new case
  var checkers = (user.role === 'normal' && !caseRow) ? Cases.activeCheckers() : [];

  // ---- fill sidebar placeholders ----
  var navSection = document.getElementById('sidebar-nav-section');
  if (caseRow) {
    navSection.innerHTML =
      '<div class="group-label">Reviewing</div>' +
      '<div class="case-info-chip">' +
        '<div class="ref">' + esc(caseRow.reference) + '</div>' +
        '<span class="status-pill ' + esc(caseRow.status) + '">' + esc(caseRow.status.toUpperCase().replace(/_/g, ' ')) + '</span>' +
      '</div>';
  } else {
    navSection.innerHTML =
      '<div class="group-label">Standalone</div>' +
      '<button class="nav-item" data-mode="pf" title="Personal Financing (PF)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg><span class="nav-txt">Personal Financing (PF)</span></button>' +
      '<button class="nav-item" data-mode="hf" title="Home Financing (HF)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><rect x="10" y="14" width="4" height="5.5"/></svg><span class="nav-txt">Home Financing (HF)</span></button>' +
      '<button class="nav-item" data-mode="cc" title="Credit Card (CC)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h5"/></svg><span class="nav-txt">Credit Card (CC)</span></button>' +
      '<div class="group-label">Combo (shared CCRIS + income)</div>' +
      '<button class="nav-item" data-mode="pf-cc" title="PF + CC"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="3.5"/><rect x="12" y="12" width="10" height="8" rx="1.5"/><path d="M12 15.5h10"/><path d="M2 20c0-3 2.6-5 6-5"/></svg><span class="nav-txt">PF + CC</span></button>' +
      '<button class="nav-item" data-mode="hf-cc" title="HF + CC"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 9.5 9 4l6.5 5.5"/><path d="M4.5 8.5V16h9V8.5"/><rect x="12" y="13" width="10" height="7.5" rx="1.5"/><path d="M12 16h10"/></svg><span class="nav-txt">HF + CC</span></button>' +
      '<button class="nav-item" data-mode="pf-hf" title="PF + HF"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="7" r="3.5"/><path d="M1.5 19c0-3.4 2.7-5.5 6-5.5"/><path d="M11 15.5 16.5 11l5.5 4.5"/><path d="M13 14.7V21h7v-6.3"/></svg><span class="nav-txt">PF + HF</span></button>';
  }

  var resetSection = document.getElementById('sidebar-reset-section');
  if (!caseRow) {
    resetSection.innerHTML =
      '<button id="btn-reset" type="button" title="Reset all inputs">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>' +
      '<span class="nav-txt">Reset all inputs</span></button>';
  }

  document.getElementById('calc-logout').addEventListener('click', function (e) {
    e.preventDefault();
    Auth.logout();
    location.href = '/login.html';
  });

  // ---- notice banner ----
  var noticeBanner = document.getElementById('notice-banner');
  if (params.has('submitted')) {
    noticeBanner.innerHTML = '<div class="notice info no-print">Case ' + esc(caseRow ? caseRow.reference : '') +
      ' submitted to ' + esc((injectedCase && injectedCase.checkerName) || 'the checker') + ' for sign-off.</div>';
  } else if (params.has('decided')) {
    noticeBanner.innerHTML = '<div class="notice info no-print">Decision saved: ' + esc((caseRow && caseRow.status || '').toUpperCase()) + '.</div>';
  } else if (params.has('edited')) {
    noticeBanner.innerHTML = '<div class="notice info no-print">Changes saved. The checker will see the updated figures.</div>';
  } else if (params.has('returned')) {
    noticeBanner.innerHTML = '<div class="notice info no-print">Case ' +
      esc(caseRow ? caseRow.reference : '') + ' returned to the maker for amendment.</div>';
  } else if (params.has('resubmitted')) {
    noticeBanner.innerHTML = '<div class="notice info no-print">Case ' +
      esc(caseRow ? caseRow.reference : '') + ' resubmitted to ' +
      esc((injectedCase && injectedCase.checkerName) || 'the checker') + ' for sign-off.</div>';
  }

  // ---- globals still read directly by js/panels.js and js/report.js ----
  window.__DSR_USER = { id: user.id, name: user.name, staffId: user.staff_id, role: user.role };
  window.__DSR_CHECKERS = checkers;
  window.__DSR_CASE = injectedCase;
})();
