<?php
/**
 * Shared chrome for every server-rendered page (not the calculator itself,
 * which has its own product-switching sidebar in web/index.php - this one
 * is page-to-page navigation). Same .layout/.sidebar/.nav-item components
 * as the calculator, so the whole authenticated app reads as one system.
 * Include after Auth::requireLogin(). Expects: $pageTitle (string),
 * $activeNav (string key, optional).
 */
$__user = Auth::user();
$__active = $activeNav ?? '';
function navActive(string $key, string $active): string
{
    return $key === $active ? ' active' : '';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= e($pageTitle ?? 'ARBM DSR Calculator') ?></title>
<link rel="icon" type="image/png" href="/public/favicon.png">
<link rel="stylesheet" href="/css/styles.css">
<link rel="stylesheet" href="/css/app.css">
</head>
<body>
<div class="layout" id="layout">

  <!-- ================= SIDEBAR ================= -->
  <nav class="sidebar no-print" id="sidebar">
    <div class="brand" style="flex-direction:column;align-items:flex-start;gap:8px;">
      <span class="brand-logo">
        <img class="logo-full" src="/public/white_logo_alrajhi.png" alt="Al Rajhi Bank">
        <img class="logo-mark" src="/public/favicon.png" alt="Al Rajhi Bank">
      </span>
      <div class="t2">Financing &amp; DSR Calculator</div>
    </div>

    <div class="sidebar-scroll">
    <div class="group-label"><?= $__user['role'] === 'admin' ? 'Navigation' : 'Menu' ?></div>
    <a class="nav-item<?= navActive('dashboard', $__active) ?>" href="/dashboard.php">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
      <span class="nav-txt">Dashboard</span>
    </a>
    <?php if ($__user['role'] === 'normal'): ?>
      <!-- direct entry points into the calculator, replacing a generic
           "New Case" link - same Standalone/Combo grouping as the
           calculator's own sidebar, so there's one nav vocabulary
           whether you're on Dashboard or already inside the calculator -->
      <div class="group-label">Standalone</div>
      <a class="nav-item" href="/index.php#/pf">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
        <span class="nav-txt">Personal Financing (PF)</span>
      </a>
      <a class="nav-item" href="/index.php#/hf">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><rect x="10" y="14" width="4" height="5.5"/></svg>
        <span class="nav-txt">Home Financing (HF)</span>
      </a>
      <a class="nav-item" href="/index.php#/cc">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h5"/></svg>
        <span class="nav-txt">Credit Card (CC)</span>
      </a>
      <div class="group-label">Combo (shared CCRIS + income)</div>
      <a class="nav-item" href="/index.php#/pf-cc">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="3.5"/><rect x="12" y="12" width="10" height="8" rx="1.5"/><path d="M12 15.5h10"/><path d="M2 20c0-3 2.6-5 6-5"/></svg>
        <span class="nav-txt">PF + CC</span>
      </a>
      <a class="nav-item" href="/index.php#/hf-cc">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 9.5 9 4l6.5 5.5"/><path d="M4.5 8.5V16h9V8.5"/><rect x="12" y="13" width="10" height="7.5" rx="1.5"/><path d="M12 16h10"/></svg>
        <span class="nav-txt">HF + CC</span>
      </a>
      <a class="nav-item" href="/index.php#/pf-hf">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="7" r="3.5"/><path d="M1.5 19c0-3.4 2.7-5.5 6-5.5"/><path d="M11 15.5 16.5 11l5.5 4.5"/><path d="M13 14.7V21h7v-6.3"/></svg>
        <span class="nav-txt">PF + HF</span>
      </a>
    <?php elseif ($__user['role'] === 'checker'): ?>
      <a class="nav-item<?= navActive('cases', $__active) ?>" href="/cases.php">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>
        <span class="nav-txt">My Queue</span>
      </a>
    <?php elseif ($__user['role'] === 'admin'): ?>
      <a class="nav-item<?= navActive('admin', $__active) ?>" href="/admin/index.php">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 3 6v6c0 5 3.8 8.7 9 10 5.2-1.3 9-5 9-10V6l-9-4Z"/></svg>
        <span class="nav-txt">Admin Dashboard</span>
      </a>
      <a class="nav-item<?= navActive('users', $__active) ?>" href="/admin/users.php">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 8.5a3 3 0 1 0 0-6"/><path d="M18.5 14.3c2 .7 3.5 2.7 3.5 5.2"/></svg>
        <span class="nav-txt">Users</span>
      </a>
      <a class="nav-item<?= navActive('audit', $__active) ?>" href="/admin/audit.php">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg>
        <span class="nav-txt">Audit Log</span>
      </a>

      <div class="group-label">Policy Settings</div>
      <a class="nav-item<?= navActive('settings', $__active) ?>" href="/admin/settings.php?sec=0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
        <span class="nav-txt">Customer Class (A / B)</span>
      </a>
      <a class="nav-item<?= navActive('settings', $__active) ?>" href="/admin/settings.php?sec=1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        <span class="nav-txt">Personal Financing</span>
      </a>
      <a class="nav-item<?= navActive('settings', $__active) ?>" href="/admin/settings.php?sec=2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><rect x="10" y="14" width="4" height="5.5"/></svg>
        <span class="nav-txt">Home Financing</span>
      </a>
      <a class="nav-item<?= navActive('settings', $__active) ?>" href="/admin/settings.php?sec=3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/></svg>
        <span class="nav-txt">Unsecured Exposure</span>
      </a>
      <a class="nav-item<?= navActive('settings', $__active) ?>" href="/admin/settings.php?sec=4">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h5"/></svg>
        <span class="nav-txt">Credit Card</span>
      </a>
      <a class="nav-item<?= navActive('settings', $__active) ?>" href="/admin/settings.php?sec=5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg>
        <span class="nav-txt">CCRIS Commitments</span>
      </a>
      <a class="nav-item<?= navActive('settings', $__active) ?>" href="/admin/settings.php?sec=6">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l5-5 4 4 8-8"/><path d="M14 8h6v6"/></svg>
        <span class="nav-txt">Income Recognition</span>
      </a>
      <a class="nav-item<?= navActive('settings', $__active) ?>" href="/admin/settings.php?sec=7">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
        <span class="nav-txt">PF Pricing Matrices</span>
      </a>
    <?php endif; ?>
    </div>

    <div class="foot">
      <div class="user-chip"><?= e($__user['name']) ?> &middot; <?= e($__user['role']) ?></div>
      <a href="/change_password.php" title="Change password">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>
        <span class="nav-txt">Change password</span>
      </a>
      <a href="/logout.php" title="Logout">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
        <span class="nav-txt">Logout</span>
      </a>
    </div>
  </nav>

  <!-- ================= MAIN ================= -->
  <main class="main">
    <div class="topbar">
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="hamburger no-print" id="btn-menu" type="button" aria-label="Menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
        <h1 id="page-title"><?= e($pageTitle ?? '') ?></h1>
      </div>
    </div>
    <div class="app-shell">
