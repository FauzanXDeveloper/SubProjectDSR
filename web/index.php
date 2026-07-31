<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/bootstrap.php';

$user = Auth::requireLogin();

$caseRow = null;
$caseId = isset($_GET['case']) ? (int) $_GET['case'] : 0;
if ($caseId) {
    $caseRow = Cases::find($caseId);
    if (!$caseRow || !Cases::canView($caseRow, $user)) {
        Http::deny(403, 'You do not have access to that case.');
    }
} elseif ($user['role'] === 'admin') {
    // admins review submitted cases (read-only, via a case link) but don't
    // run the calculator themselves - that's the maker's job
    Http::redirect('/dashboard.php');
}

$injectedCase = null;
if ($caseRow) {
    $payload = json_decode($caseRow['payload_json'], true) ?: [];
    $checkerName = null;
    if ($caseRow['assigned_checker_id']) {
        $s = Db::pdo()->prepare('SELECT name FROM users WHERE id = :id');
        $s->execute([':id' => $caseRow['assigned_checker_id']]);
        $r = $s->fetch();
        $checkerName = $r['name'] ?? null;
    }
    $injectedCase = [
        'id'            => (int) $caseRow['id'],
        'reference'     => $caseRow['reference'],
        'status'        => $caseRow['status'],
        'mode'          => $caseRow['mode'],
        'state'         => $payload['state'] ?? new stdClass(),
        'makerId'       => (int) $caseRow['created_by'],
        'checkerName'   => $checkerName,
        'decidedAt'     => $caseRow['decided_at'],
        'decisionNotes' => $caseRow['decision_notes'],
        'editCount'     => (int) $caseRow['edit_count'],
        'editedAt'      => $caseRow['edited_at'],
    ];
}

// only relevant when a maker is starting a brand-new case
$checkers = ($user['role'] === 'normal' && !$caseRow) ? Cases::activeCheckers() : [];
$overrides = PolicyConfig::overrides();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ARBM Financing &amp; DSR Calculator</title>
<link rel="icon" type="image/png" href="public/favicon.png">
<link rel="stylesheet" href="css/styles.css">
<link rel="stylesheet" href="css/app.css">
</head>
<body>
<div class="layout">

  <!-- ================= SIDEBAR ================= -->
  <nav class="sidebar no-print" id="sidebar">
    <div class="brand" style="flex-direction:column;align-items:flex-start;gap:8px;">
      <span class="brand-logo">
        <img class="logo-full" src="public/white_logo_alrajhi.png" alt="Al Rajhi Bank">
        <img class="logo-mark" src="public/favicon.png" alt="Al Rajhi Bank">
      </span>
      <div class="t2">Financing &amp; DSR Calculator</div>
    </div>

    <div class="sidebar-scroll">
    <div class="group-label">Menu</div>
    <a class="nav-item" href="/dashboard.php">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
      <span class="nav-txt">Dashboard</span>
    </a>

    <?php if ($caseRow): ?>
      <!-- viewing an existing (locked, read-only) case: the mode is fixed
           by the maker who submitted it, so switching Standalone/Combo
           mode here isn't a meaningful action - show what's being
           reviewed instead -->
      <div class="group-label">Reviewing</div>
      <div class="case-info-chip">
        <div class="ref"><?= e($caseRow['reference']) ?></div>
        <span class="status-pill <?= e($caseRow['status']) ?>"><?= e(strtoupper(str_replace('_', ' ', $caseRow['status']))) ?></span>
      </div>
    <?php else: ?>
      <div class="group-label">Standalone</div>
      <button class="nav-item" data-mode="pf" title="Personal Financing (PF)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
        <span class="nav-txt">Personal Financing (PF)</span>
      </button>
      <button class="nav-item" data-mode="hf" title="Home Financing (HF)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><rect x="10" y="14" width="4" height="5.5"/></svg>
        <span class="nav-txt">Home Financing (HF)</span>
      </button>
      <button class="nav-item" data-mode="cc" title="Credit Card (CC)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h5"/></svg>
        <span class="nav-txt">Credit Card (CC)</span>
      </button>

      <div class="group-label">Combo (shared CCRIS + income)</div>
      <button class="nav-item" data-mode="pf-cc" title="PF + CC">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="3.5"/><rect x="12" y="12" width="10" height="8" rx="1.5"/><path d="M12 15.5h10"/><path d="M2 20c0-3 2.6-5 6-5"/></svg>
        <span class="nav-txt">PF + CC</span>
      </button>
      <button class="nav-item" data-mode="hf-cc" title="HF + CC">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 9.5 9 4l6.5 5.5"/><path d="M4.5 8.5V16h9V8.5"/><rect x="12" y="13" width="10" height="7.5" rx="1.5"/><path d="M12 16h10"/></svg>
        <span class="nav-txt">HF + CC</span>
      </button>
      <button class="nav-item" data-mode="pf-hf" title="PF + HF">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="7" r="3.5"/><path d="M1.5 19c0-3.4 2.7-5.5 6-5.5"/><path d="M11 15.5 16.5 11l5.5 4.5"/><path d="M13 14.7V21h7v-6.3"/></svg>
        <span class="nav-txt">PF + HF</span>
      </button>
    <?php endif; ?>
    </div>

    <div class="foot">
      <button id="btn-collapse" type="button" title="Collapse sidebar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        <span class="nav-txt">Collapse sidebar</span>
      </button>
      <a href="/logout.php" title="Logout">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
        <span class="nav-txt">Logout</span>
      </a>
      <button id="btn-print" type="button" title="Print / Export PDF">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><rect x="6" y="15" width="12" height="6"/></svg>
        <span class="nav-txt">Print / Export PDF</span>
      </button>
      <?php if (!$caseRow): ?>
      <button id="btn-reset" type="button" title="Reset all inputs">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>
        <span class="nav-txt">Reset all inputs</span>
      </button>
      <?php endif; ?>
    </div>
  </nav>

  <!-- ================= MAIN ================= -->
  <main class="main">
    <!-- shown only on Print / Export PDF -->
    <div class="print-header">
      <img src="public/alrajhi_logo.png" alt="Al Rajhi Bank Malaysia">
      <div>
        <div class="ph-title">Financing &amp; DSR Evaluation Report</div>
        <div class="ph-sub" id="print-meta"></div>
      </div>
    </div>

    <div class="topbar">
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="hamburger no-print" id="btn-menu" type="button" aria-label="Menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
        <h1 id="page-title">Personal Financing (PF)</h1>
      </div>
      <div class="date" id="today-date"></div>
    </div>

    <?php if (isset($_GET['submitted'])): ?>
      <div class="notice info no-print">Case <?= e($caseRow['reference'] ?? '') ?> submitted to <?= e($injectedCase['checkerName'] ?? 'the checker') ?> for sign-off.</div>
    <?php elseif (isset($_GET['decided'])): ?>
      <div class="notice info no-print">Decision saved: <?= e(strtoupper($caseRow['status'] ?? '')) ?>.</div>
    <?php elseif (isset($_GET['edited'])): ?>
      <div class="notice info no-print">Changes saved. The checker will see the updated figures.</div>
    <?php endif; ?>

    <!-- Shared intake: required first for every mode -->
    <div id="intake-customer"></div>
    <div id="intake-ccris"></div>
    <div id="intake-income"></div>

    <!-- Gate message shown until minimum intake is complete -->
    <div id="intake-gate"></div>

    <!-- Product panels (visibility controlled by routing) -->
    <div id="panel-pf"></div>
    <div id="panel-hf"></div>
    <div id="panel-cc"></div>

    <!-- Combined application summary (combo modes): directly above sign-off -->
    <div id="combined-panel"></div>

    <!-- Maker / Checker sign-off -->
    <div id="signoff-panel"></div>

    <!-- Persistent app footer (shown on every product / combo view) -->
    <footer class="app-foot no-print">
      Copyright &copy; 2026 Al Rajhi Banking &amp; Investment Corporation (Malaysia) Bhd<br>
      Built by Retail Credit Risk (RCR) since July 2026<br>
      For internal credit evaluation use only.
    </footer>
  </main>
</div>

<!-- Curated evaluation report - hidden on screen, shown only when printing.
     Built fresh on each print by js/report.js (App.buildPrintReport). -->
<div id="print-report" aria-hidden="true"></div>

<!-- vendored pdf.js (client-side PDF parsing; no CDN dependency) -->
<script src="vendor/pdf.min.js"></script>

<!-- server-injected: this user, the current policy overrides (replaces the
     old localStorage copy), CSRF token, active checkers (maker's "route to"
     picker) and - when ?case=ID is open - the stored case to resume/review.
     Nothing here is ever written back to localStorage/sessionStorage. -->
<script>
  window.__DSR_USER = <?= json_encode(['id' => (int) $user['id'], 'name' => $user['name'], 'staffId' => $user['staff_id'], 'role' => $user['role']]) ?>;
  window.__DSR_CSRF = <?= json_encode(Csrf::token()) ?>;
  window.__DSR_CONFIG_OVERRIDES = <?= $overrides ? json_encode($overrides) : 'null' ?>;
  window.__DSR_CHECKERS = <?= json_encode($checkers) ?>;
  window.__DSR_CASE = <?= $injectedCase ? json_encode($injectedCase) : 'null' ?>;
</script>

<!-- shared engine (pure functions, no I/O). config.js MUST load first:
     it holds every policy constant + the server's admin overrides -->
<script src="js/engine/config.js"></script>
<script src="js/engine/pmt.js"></script>
<script src="js/engine/age.js"></script>
<script src="js/engine/facilityRates.js"></script>
<script src="js/engine/ccrisLine.js"></script>
<script src="js/engine/income.js"></script>
<script src="js/engine/creditLimit.js"></script>
<script src="js/engine/dsrThresholds.js"></script>
<script src="js/engine/hfPricing.js"></script>
<script src="js/engine/hfSummary.js"></script>
<script src="js/engine/pdfExtractor.js"></script>
<script src="data/ndiPricing.js"></script>

<!-- app -->
<script src="js/state.js"></script>
<script src="js/modal.js"></script>
<script src="js/format.js"></script>
<script src="js/intake.js"></script>
<script src="js/panels.js"></script>
<script src="js/report.js"></script>
<script src="js/app.js"></script>
<!-- caseSync.js: after app.js on purpose - see its header comment -->
<script src="js/caseSync.js"></script>
</body>
</html>
<?php
/*
 * WHAT THIS PAGE DOES (in plain language)
 * ----------------------------------------
 * This is the main calculator - the heart of the application. It's the
 * page a "preparer" (normal user) uses to work out a customer's DSR
 * (Debt Service Ratio) for Personal Financing, Home Financing, Credit
 * Card, or a combination of these, and a checker/admin uses to review
 * a case that's already been submitted.
 *
 * How it decides what to show:
 * - If the URL includes a case ID (e.g. index.php?case=42), it loads
 *   that saved case from the database and checks the current user is
 *   allowed to view it. That saved data (customer info, CCRIS lines,
 *   income, the chosen product mode, sign-off details, etc.) is then
 *   handed to the page as read-only data for the checker/reviewer, or
 *   as an editable in-progress case for its maker.
 * - If there's no case ID and the user is an admin, they're redirected
 *   to the dashboard - admins review cases, they don't run new ones.
 * - If there's no case ID and the user is a preparer, this becomes a
 *   fresh, blank calculator: they pick a financing mode from the
 *   sidebar (PF, HF, CC, or a combo) and start entering customer,
 *   CCRIS, and income details.
 *
 * How the calculation actually happens:
 * - This page itself does NOT do any DSR math. It only prepares data
 *   on the server (the logged-in user, policy config overrides, the
 *   list of available checkers, and the case being viewed, if any)
 *   and hands it to the browser via `window.__DSR_*` variables.
 * - All the real number-crunching happens client-side in the /js/
 *   files loaded at the bottom (config.js, pmt.js, income.js,
 *   creditLimit.js, dsrThresholds.js, hfPricing.js, etc.) which read
 *   what the user types in and compute affordability, limits, and the
 *   DSR percentage live in the browser.
 * - caseSync.js then talks to the api/*.php endpoints in the
 *   background to save drafts, submit cases, or record a checker's
 *   decision, without reloading the page.
 * - The print/export button uses report.js to build a clean printable
 *   summary of the whole evaluation.
 */
