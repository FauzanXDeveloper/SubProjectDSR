<?php
declare(strict_types=1);
require_once __DIR__ . '/../../app/bootstrap.php';
require_once __DIR__ . '/../partials/charts.php';

$user = Auth::requireLogin();
Rbac::requireRole($user, ['admin']);

$counts = Cases::statusCounts();
$total = array_sum($counts);

$pdo = Db::pdo();
$byMaker = $pdo->query(
    "SELECT u.name, COUNT(*) AS n,
            SUM(CASE WHEN c.status='approved' THEN 1 ELSE 0 END) AS approved,
            SUM(CASE WHEN c.status='rejected' THEN 1 ELSE 0 END) AS rejected
     FROM cases c JOIN users u ON u.id = c.created_by
     GROUP BY c.created_by ORDER BY n DESC"
)->fetchAll();

// decided cases only - who actually clicked Approve/Reject
$byChecker = $pdo->query(
    "SELECT u.name, COUNT(*) AS n,
            SUM(CASE WHEN c.status='approved' THEN 1 ELSE 0 END) AS approved,
            SUM(CASE WHEN c.status='rejected' THEN 1 ELSE 0 END) AS rejected
     FROM cases c JOIN users u ON u.id = c.assigned_checker_id
     WHERE c.status IN ('approved','rejected')
     GROUP BY c.assigned_checker_id ORDER BY n DESC"
)->fetchAll();

// "Cases by day" date range - presets (7/14/30/90) or a custom from/to,
// via plain GET params so the page stays a normal server-rendered reload
// (consistent with the rest of this app - no client-side fetch state).
// Everything else on the dashboard (stat tiles, outcomes, by maker/checker)
// stays all-time; only this one chart is date-scoped, since that's the
// slice the officer actually asked to filter.
function validDate(?string $s): ?string
{
    if (!$s || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return null;
    $d = DateTime::createFromFormat('Y-m-d', $s);
    return ($d && $d->format('Y-m-d') === $s) ? $s : null;
}
$rangeTo = validDate($_GET['to'] ?? null) ?? (new DateTime())->format('Y-m-d');
$rangeFrom = validDate($_GET['from'] ?? null) ?? (new DateTime($rangeTo))->modify('-13 days')->format('Y-m-d');
// keep it sane either way round, and cap the span so the chart stays readable
if ($rangeFrom > $rangeTo) { [$rangeFrom, $rangeTo] = [$rangeTo, $rangeFrom]; }
$spanDays = (new DateTime($rangeFrom))->diff(new DateTime($rangeTo))->days;
if ($spanDays > 365) { $rangeFrom = (new DateTime($rangeTo))->modify('-365 days')->format('Y-m-d'); $spanDays = 365; }

$dailyRaw = $pdo->prepare(
    "SELECT date(created_at) AS d, status, COUNT(*) AS n FROM cases
     WHERE date(created_at) BETWEEN :from AND :to GROUP BY d, status"
);
$dailyRaw->execute([':from' => $rangeFrom, ':to' => $rangeTo]);
$dailyMap = [];
foreach ($dailyRaw->fetchAll() as $row) {
    $dailyMap[$row['d']][$row['status']] = (int) $row['n'];
}
$dailySeries = [];
for ($i = 0; $i <= $spanDays; $i++) {
    $dt = (new DateTime($rangeFrom))->modify("+$i days");
    $key = $dt->format('Y-m-d');
    $c = $dailyMap[$key] ?? [];
    $dailySeries[] = [
        'label' => $dt->format('d/m'),
        'parts' => [
            ['value' => $c['approved'] ?? 0, 'color' => '#1B7A46', 'name' => 'Approved'],
            ['value' => $c['rejected'] ?? 0, 'color' => '#B3261E', 'name' => 'Rejected'],
            ['value' => $c['pending_checker'] ?? 0, 'color' => '#96690F', 'name' => 'Pending checker'],
            ['value' => $c['draft'] ?? 0, 'color' => '#64748B', 'name' => 'Draft'],
        ],
    ];
}
$rangePreset = null;
foreach ([7, 14, 30, 90] as $p) {
    if ($rangeTo === (new DateTime())->format('Y-m-d')
        && $rangeFrom === (new DateTime())->modify('-' . ($p - 1) . ' days')->format('Y-m-d')) {
        $rangePreset = $p;
    }
}

$recentAudit = $pdo->query(
    "SELECT a.*, u.name AS actor_name FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ORDER BY a.id DESC LIMIT 10"
)->fetchAll();

$pageTitle = 'Admin Dashboard';
$activeNav = 'admin';
include __DIR__ . '/../partials/header.php';
?>
<h1>Admin Dashboard</h1>
<div class="sub">System-wide case outcomes. All figures to 2 decimal places.</div>

<div class="stat-row">
  <div class="stat-tile info">
    <span class="stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg></span>
    <div class="n"><?= $total ?></div><div class="l">Total cases</div>
  </div>
  <div class="stat-tile ok">
    <span class="stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg></span>
    <div class="n"><?= $counts['approved'] ?></div><div class="l">Approved</div>
  </div>
  <div class="stat-tile fail">
    <span class="stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg></span>
    <div class="n"><?= $counts['rejected'] ?></div><div class="l">Rejected</div>
  </div>
  <div class="stat-tile warn">
    <span class="stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg></span>
    <div class="n"><?= $counts['pending_checker'] ?></div><div class="l">Pending checker</div>
  </div>
  <div class="stat-tile">
    <span class="stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg></span>
    <div class="n"><?= $counts['draft'] ?></div><div class="l">Draft</div>
  </div>
</div>

<script src="/vendor/apexcharts.min.js"></script>
<div class="chart-row">
  <div class="card">
    <div class="card-head"><span>Case outcomes</span></div>
    <div class="card-body">
      <?= chart_donut([
        ['label' => 'Approved', 'value' => $counts['approved'], 'color' => '#1B7A46'],
        ['label' => 'Rejected', 'value' => $counts['rejected'], 'color' => '#B3261E'],
        ['label' => 'Pending checker', 'value' => $counts['pending_checker'], 'color' => '#96690F'],
        ['label' => 'Draft', 'value' => $counts['draft'], 'color' => '#64748B'],
      ]) ?>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><span>Approved by checker</span></div>
    <div class="card-body">
      <?= chart_checker_bar(array_map(function ($r) {
        return ['label' => $r['name'], 'approved' => (int) $r['approved'], 'rejected' => (int) $r['rejected']];
      }, $byChecker)) ?>
    </div>
  </div>
</div>

<div class="card" id="charts">
  <div class="card-head"><span>Cases by day</span><span class="sub" style="margin:0"><?= e($rangeFrom) ?> &rarr; <?= e($rangeTo) ?></span></div>
  <div class="card-body">
    <div class="toolbar">
      <?php foreach ([7 => 'Last 7 days', 14 => 'Last 14 days', 30 => 'Last 30 days', 90 => 'Last 90 days'] as $p => $plabel): ?>
        <a class="btn small <?= $rangePreset === $p ? '' : 'secondary' ?>"
           href="/admin/index.php?from=<?= e((new DateTime())->modify('-' . ($p - 1) . ' days')->format('Y-m-d')) ?>&to=<?= e((new DateTime())->format('Y-m-d')) ?>#charts"><?= e($plabel) ?></a>
      <?php endforeach; ?>
      <form method="get" style="display:flex;gap:8px;align-items:center;margin-left:auto" action="/admin/index.php#charts">
        <input type="date" name="from" value="<?= e($rangeFrom) ?>" max="<?= e($rangeTo) ?>" style="padding:5px 8px;font-size:12px">
        <span class="sub" style="margin:0">to</span>
        <input type="date" name="to" value="<?= e($rangeTo) ?>" max="<?= e((new DateTime())->format('Y-m-d')) ?>" style="padding:5px 8px;font-size:12px">
        <button class="btn small" type="submit">Apply</button>
      </form>
    </div>
    <?= chart_daily_area($dailySeries) ?>
  </div>
</div>

<div class="card">
  <div class="card-head"><span>By maker</span></div>
  <div class="card-body">
    <?php if (!$byMaker): ?>
      <p class="sub" style="margin:0">No cases submitted yet.</p>
    <?php else: ?>
      <div class="tbl-wrap"><table class="data">
        <thead><tr><th>Maker</th><th class="num">Total</th><th class="num">Approved</th><th class="num">Rejected</th><th class="num">Approval rate</th></tr></thead>
        <tbody>
        <?php foreach ($byMaker as $m): $rate = $m['n'] > 0 ? ($m['approved'] / $m['n']) * 100 : 0; ?>
          <tr>
            <td><?= e($m['name']) ?></td>
            <td class="num"><?= (int) $m['n'] ?></td>
            <td class="num"><?= (int) $m['approved'] ?></td>
            <td class="num"><?= (int) $m['rejected'] ?></td>
            <td class="num"><?= number_format($rate, 2) ?>%</td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table></div>
    <?php endif; ?>
  </div>
</div>

<div class="card">
  <div class="card-head"><span>Recent activity</span></div>
  <div class="card-body">
    <div class="tbl-wrap"><table class="data">
      <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
      <tbody>
      <?php foreach ($recentAudit as $a): ?>
        <tr>
          <td><?= e(substr((string) $a['created_at'], 0, 19)) ?></td>
          <td><?= e($a['actor_name'] ?? 'system') ?></td>
          <td><?= e($a['action']) ?></td>
          <td><?= e($a['target_type'] ? $a['target_type'] . ' #' . $a['target_id'] : '-') ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table></div>
    <p style="margin-top:12px"><a href="/admin/audit.php">Full audit log &rarr;</a></p>
  </div>
</div>
<?php include __DIR__ . '/../partials/footer.php'; ?>
