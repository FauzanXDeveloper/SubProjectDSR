<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/bootstrap.php';

$user = Auth::requireLogin();
$rows = Cases::listForUser($user);

$counts = ['draft' => 0, 'pending_checker' => 0, 'approved' => 0, 'rejected' => 0];
foreach ($rows as $r) {
    if (isset($counts[$r['status']])) {
        $counts[$r['status']]++;
    }
}

function statusLabel(string $s): string
{
    return ['draft' => 'Draft', 'pending_checker' => 'Pending Checker', 'approved' => 'Approved', 'rejected' => 'Rejected'][$s] ?? $s;
}

$pageTitle = 'Dashboard';
$activeNav = 'dashboard';
include __DIR__ . '/partials/header.php';
?>
<h1>Welcome, <?= e($user['name']) ?></h1>
<div class="sub">
  <?php if ($user['role'] === 'normal'): ?>
    Your submitted cases and their sign-off status.
  <?php elseif ($user['role'] === 'checker'): ?>
    Cases routed to you for review.
  <?php else: ?>
    System-wide activity. Visit <a href="/admin/index.php">Admin</a> for full statistics.
  <?php endif; ?>
</div>

<div class="stat-row">
  <?php if ($user['role'] === 'normal'): ?>
    <div class="stat-tile info">
      <span class="stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg></span>
      <div class="n"><?= $counts['pending_checker'] ?></div><div class="l">Awaiting checker</div>
    </div>
  <?php endif; ?>
  <div class="stat-tile ok">
    <span class="stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg></span>
    <div class="n"><?= $counts['approved'] ?></div><div class="l">Approved</div>
  </div>
  <div class="stat-tile fail">
    <span class="stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg></span>
    <div class="n"><?= $counts['rejected'] ?></div><div class="l">Rejected</div>
  </div>
  <?php if ($user['role'] !== 'normal'): ?>
    <div class="stat-tile warn">
      <span class="stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg></span>
      <div class="n"><?= $counts['pending_checker'] ?></div><div class="l">Pending</div>
    </div>
  <?php endif; ?>
</div>

<?php if ($user['role'] === 'normal'): ?>
  <p><a class="btn" href="/index.php">+ New Case</a></p>
<?php endif; ?>

<div class="card">
  <div class="card-head"><span>Recent cases</span></div>
  <div class="card-body">
    <?php if (!$rows): ?>
      <p class="sub" style="margin:0">No cases yet.</p>
    <?php else: ?>
      <div class="tbl-wrap"><table class="data">
        <thead><tr><th>Reference</th><th>Customer</th><th>Mode</th><th>Maker</th><th>Checker</th><th>Status</th><th></th></tr></thead>
        <tbody>
        <?php foreach (array_slice($rows, 0, 8) as $r): ?>
          <tr>
            <td><?= e($r['reference']) ?></td>
            <td><?= e($r['customer_name'] ?: '-') ?></td>
            <td><?= e(strtoupper($r['mode'])) ?></td>
            <td><?= e($r['maker_name'] ?? '-') ?></td>
            <td><?= e($r['checker_name'] ?? '-') ?></td>
            <td><span class="status-pill <?= e($r['status']) ?>"><?= e(statusLabel($r['status'])) ?></span></td>
            <td><a href="/index.php?case=<?= (int) $r['id'] ?>">View</a></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table></div>
      <?php if ($user['role'] !== 'admin'): ?>
        <p style="margin-top:12px"><a href="/cases.php">View all &rarr;</a></p>
      <?php endif; ?>
    <?php endif; ?>
  </div>
</div>
<?php include __DIR__ . '/partials/footer.php'; ?>
