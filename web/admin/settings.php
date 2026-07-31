<?php
declare(strict_types=1);
require_once __DIR__ . '/../../app/bootstrap.php';

$__user = Auth::requireLogin();
Rbac::requireRole($__user, ['admin']);

$__overrides = PolicyConfig::overrides();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin - Calculation Settings | ARBM DSR Calculator</title>
<link rel="icon" type="image/png" href="../public/favicon.png">
<link rel="stylesheet" href="../css/styles.css">
<link rel="stylesheet" href="../css/app.css">
<style>
  /* one settings section visible at a time (sidebar-routed) */
  .adm-sec { display: none; }
  .adm-sec.active { display: block; }

  .adm-status { font-size: 12px; color: var(--muted); }
  .adm-status .chip { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 700; font-size: 11px; }
  .adm-status .chip.def { background: var(--ok-soft); color: var(--ok); }
  .adm-status .chip.ovr { background: var(--warn-soft); color: var(--warn); }

  .adm-grid td input { text-align: right; font-variant-numeric: tabular-nums; }
  .adm-grid th:first-child, .adm-grid td:first-child { text-align: left; white-space: nowrap; }
  .adm-note { font-size: 11.5px; color: var(--muted); margin: 4px 0 12px; }

  .mx-wrap { overflow-x: auto; }
  .mx-wrap table { border-collapse: collapse; font-size: 11px; }
  .mx-wrap th, .mx-wrap td { border: 1px solid var(--border); padding: 2px; }
  .mx-wrap th { background: #F1F4F8; padding: 4px 6px; }
  .mx-wrap input { width: 86px; border: none; padding: 3px 4px; font-size: 11px;
    text-align: right; font-variant-numeric: tabular-nums; background: var(--editable); }

  .savebar {
    position: sticky; bottom: 0; margin-top: 22px;
    background: #fff; border: 1px solid var(--border-strong); border-radius: var(--radius);
    padding: 10px 16px; display: flex; gap: 12px; align-items: center;
    box-shadow: 0 -2px 10px rgba(22,50,79,.08);
  }
  .savebar .msg { font-size: 12px; color: var(--ok); font-weight: 600; }
</style>
</head>
<body>
<div class="layout">

  <!-- ================= SIDEBAR ================= -->
  <nav class="sidebar no-print" id="sidebar">
    <div class="brand" style="flex-direction:column;align-items:flex-start;gap:8px;">
      <span class="brand-logo">
        <img class="logo-full" src="../public/white_logo_alrajhi.png" alt="Al Rajhi Bank">
        <img class="logo-mark" src="../public/favicon.png" alt="Al Rajhi Bank">
      </span>
      <div class="t2">Calculation Settings (Admin)</div>
    </div>

    <div class="sidebar-scroll">
    <div class="group-label">Navigation</div>
    <a class="nav-item" href="/dashboard.php">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
      <span class="nav-txt">Dashboard</span>
    </a>
    <a class="nav-item" href="/admin/index.php">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 3 6v6c0 5 3.8 8.7 9 10 5.2-1.3 9-5 9-10V6l-9-4Z"/></svg>
      <span class="nav-txt">Admin Dashboard</span>
    </a>
    <a class="nav-item" href="/admin/users.php">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 8.5a3 3 0 1 0 0-6"/><path d="M18.5 14.3c2 .7 3.5 2.7 3.5 5.2"/></svg>
      <span class="nav-txt">Users</span>
    </a>
    <a class="nav-item" href="/admin/audit.php">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg>
      <span class="nav-txt">Audit Log</span>
    </a>

    <div class="group-label">Policy Settings</div>
    <button class="nav-item" data-sec="0" title="Customer Class">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
      <span class="nav-txt">Customer Class (A / B)</span>
    </button>
    <button class="nav-item" data-sec="1" title="Personal Financing">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      <span class="nav-txt">Personal Financing</span>
    </button>
    <button class="nav-item" data-sec="2" title="Home Financing">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><rect x="10" y="14" width="4" height="5.5"/></svg>
      <span class="nav-txt">Home Financing</span>
    </button>
    <button class="nav-item" data-sec="3" title="Unsecured Exposure">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/></svg>
      <span class="nav-txt">Unsecured Exposure</span>
    </button>
    <button class="nav-item" data-sec="4" title="Credit Card">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h5"/></svg>
      <span class="nav-txt">Credit Card</span>
    </button>
    <button class="nav-item" data-sec="5" title="CCRIS Commitments">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg>
      <span class="nav-txt">CCRIS Commitments</span>
    </button>
    <button class="nav-item" data-sec="6" title="Income Recognition">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l5-5 4 4 8-8"/><path d="M14 8h6v6"/></svg>
      <span class="nav-txt">Income Recognition</span>
    </button>
    <button class="nav-item" data-sec="7" title="PF Pricing Matrices">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
      <span class="nav-txt">PF Pricing Matrices</span>
    </button>
    </div>

    <div class="foot">
      <div class="user-chip"><?= e($__user['name']) ?> &middot; admin</div>
      <a href="/change_password.php" title="Change password">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>
        <span class="nav-txt">Change password</span>
      </a>
      <a href="/logout.php" title="Logout">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
        <span class="nav-txt">Logout</span>
      </a>
      <button id="btn-export" type="button" title="Export settings (JSON)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></svg>
        <span class="nav-txt">Export settings (JSON)</span>
      </button>
      <button id="btn-import" type="button" title="Import settings (JSON)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 21h16"/></svg>
        <span class="nav-txt">Import settings (JSON)</span>
      </button>
      <input type="file" id="file-import" accept=".json" style="display:none">
      <button id="btn-reset" type="button" title="Reset to Excel defaults">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>
        <span class="nav-txt">Reset to Excel defaults</span>
      </button>
    </div>
  </nav>

  <!-- ================= MAIN ================= -->
  <main class="main">
    <div class="topbar">
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="hamburger no-print" id="btn-menu" type="button" aria-label="Menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
        <h1 id="page-title">Customer Class (A / B)</h1>
      </div>
      <div class="adm-status" id="adm-status"></div>
    </div>

    <div class="notice">Changes are saved to the database and apply to <b>every user</b> once saved -
    they take effect the next time the calculator page loads. Reset restores every value to the
    master Excel defaults.</div>

    <div id="adm-sections"></div>

    <div class="savebar no-print">
      <button class="btn" id="btn-save" type="button">Save all settings</button>
      <span style="font-size:12px;color:var(--muted)">Saves every section, not just the one on screen.</span>
      <span class="msg" id="save-msg"></span>
    </div>
  </main>
</div>

<!-- server-injected: policy overrides (replaces the old localStorage copy),
     CSRF token and save endpoint for js/admin.js -->
<script>
  window.__DSR_CONFIG_OVERRIDES = <?= $__overrides ? json_encode($__overrides) : 'null' ?>;
  window.__DSR_CSRF = <?= json_encode(Csrf::token()) ?>;
  window.__DSR_CONFIG_SAVE_URL = '/api/config_save.php';
</script>
<!-- config first, then the data the matrix editor needs -->
<script src="../js/engine/config.js"></script>
<script src="../data/ndiPricing.js"></script>
<script src="../js/admin.js"></script>
</body>
</html>
<?php
/*
 * WHAT THIS PAGE DOES (in plain language)
 * ----------------------------------------
 * This is the "Calculation Settings" page - the control panel where an
 * admin can tune the bank's policy numbers that drive the DSR
 * calculator (customer class thresholds, financing limits, CCRIS
 * commitment rules, income recognition rules, and PF pricing tables),
 * without anyone needing to touch code.
 *
 * - It loads any existing overrides from the database
 *   (PolicyConfig::overrides) and hands them to the browser so the
 *   settings form starts pre-filled with whatever is currently active,
 *   or the Excel-derived defaults if nothing's been overridden yet.
 * - The sidebar switches between different settings sections (Customer
 *   Class, Personal Financing, Home Financing, etc.) - only one is
 *   shown on screen at a time, but "Save all settings" saves every
 *   section together, not just the visible one.
 * - Saving doesn't happen through a page reload - js/admin.js sends
 *   the changes to api/config_save.php in the background. Those
 *   changes apply system-wide, for every user, from their next page
 *   load onward.
 * - Export/Import buttons let an admin download the current settings
 *   as a JSON file, or upload one to restore a previous configuration.
 *   "Reset to Excel defaults" clears all overrides back to the
 *   original master values.
 */
