<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/bootstrap.php';

$user = Auth::requireLogin();
if ($user['role'] === 'admin') {
    // admins get case oversight via the Admin Dashboard (by-maker
    // breakdown + audit log) and the Dashboard's recent-cases preview,
    // not a maker/checker-style case queue
    Http::redirect('/admin/index.php');
}
$rows = Cases::listForUser($user);

$statusFilter = $_GET['status'] ?? '';
if ($statusFilter !== '') {
    $rows = array_values(array_filter($rows, fn($r) => $r['status'] === $statusFilter));
}

function statusLabel(string $s): string
{
    return ['draft' => 'Draft', 'pending_checker' => 'Pending Checker', 'approved' => 'Approved', 'rejected' => 'Rejected'][$s] ?? $s;
}

$title = $user['role'] === 'normal' ? 'My Cases' : ($user['role'] === 'checker' ? 'My Queue' : 'All Cases');
$pageTitle = $title;
$activeNav = 'cases';
include __DIR__ . '/partials/header.php';
?>
<h1><?= e($title) ?></h1>
<div class="sub"><?= count($rows) ?> case<?= count($rows) === 1 ? '' : 's' ?><?= $statusFilter ? ' - filtered by ' . e(statusLabel($statusFilter)) : '' ?></div>

<div class="toolbar">
  <a class="btn small <?= $statusFilter === '' ? '' : 'secondary' ?>" href="/cases.php">All</a>
  <a class="btn small <?= $statusFilter === 'pending_checker' ? '' : 'secondary' ?>" href="/cases.php?status=pending_checker">Pending</a>
  <a class="btn small <?= $statusFilter === 'approved' ? '' : 'secondary' ?>" href="/cases.php?status=approved">Approved</a>
  <a class="btn small <?= $statusFilter === 'rejected' ? '' : 'secondary' ?>" href="/cases.php?status=rejected">Rejected</a>
</div>

<div class="card">
  <div class="card-body">
    <?php if (!$rows): ?>
      <p class="sub" style="margin:0">No cases found.</p>
    <?php else: ?>
      <div class="tbl-wrap"><table class="data">
        <thead><tr>
          <th>Reference</th><th>Customer</th><th>IC</th><th>Mode</th>
          <th class="num">Gross (RM)</th><th class="num">DSR</th>
          <th>Maker</th><th>Checker</th><th>Status</th><th>Submitted</th><th></th>
        </tr></thead>
        <tbody>
        <?php foreach ($rows as $r): ?>
          <tr>
            <td><?= e($r['reference']) ?></td>
            <td><?= e($r['customer_name'] ?: '-') ?></td>
            <td><?= e($r['customer_ic'] ?: '-') ?></td>
            <td><?= e(strtoupper($r['mode'])) ?></td>
            <td class="num"><?= $r['gross_income'] !== null ? number_format((float) $r['gross_income'], 2) : '-' ?></td>
            <td class="num"><?= $r['dsr_value'] !== null ? number_format((float) $r['dsr_value'] * 100, 2) . '%' : '-' ?></td>
            <td><?= e($r['maker_name'] ?? '-') ?></td>
            <td><?= e($r['checker_name'] ?? '-') ?></td>
            <td><span class="status-pill <?= e($r['status']) ?>"><?= e(statusLabel($r['status'])) ?></span>
              <?php if ((int) ($r['edit_count'] ?? 0) > 0): ?>
                <span class="status-pill pending_checker" title="Edited <?= (int) $r['edit_count'] ?> time<?= (int) $r['edit_count'] === 1 ? '' : 's' ?> since submission">Edited</span>
              <?php endif; ?>
            </td>
            <td><?= e($r['submitted_at'] ? substr($r['submitted_at'], 0, 10) : '-') ?></td>
            <td><a href="/index.php?case=<?= (int) $r['id'] ?>">Open</a></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table></div>
    <?php endif; ?>
  </div>
</div>
<?php include __DIR__ . '/partials/footer.php'; ?>
<?php
/*
 * WHAT THIS PAGE DOES (in plain language)
 * ----------------------------------------
 * This is the full case list/queue - a more detailed version of the
 * "recent cases" preview shown on the dashboard.
 *
 * - Admins are redirected away to the Admin Dashboard, since they get
 *   their own oversight view instead of a personal queue.
 * - It loads all cases the current user can see (Cases::listForUser),
 *   and if a "status" filter is present in the URL (e.g. ?status=approved)
 *   it narrows the list down to just that status.
 * - The page title changes depending on role: "My Cases" for a
 *   preparer, "My Queue" for a checker.
 * - It renders a filter toolbar (All / Pending / Approved / Rejected)
 *   and a table with full details per case: reference, customer, IC,
 *   mode, gross income, DSR percentage, maker, checker, status
 *   (including whether it was edited after submission), and the
 *   submission date - each row links to open that case.
 */
