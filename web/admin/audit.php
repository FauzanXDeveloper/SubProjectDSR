<?php
declare(strict_types=1);
require_once __DIR__ . '/../../app/bootstrap.php';

$admin = Auth::requireLogin();
Rbac::requireRole($admin, ['admin']);

$page = max(1, (int) ($_GET['page'] ?? 1));
$filters = [
    'actor_user_id' => $_GET['actor'] ?? '',
    'action'        => $_GET['action'] ?? '',
    'from'          => $_GET['from'] ?? '',
    'to'            => $_GET['to'] ?? '',
];
$result = Audit::search($filters, $page, 50);
$totalPages = max(1, (int) ceil($result['total'] / 50));

$users = Db::pdo()->query('SELECT id, name, username FROM users ORDER BY name')->fetchAll();
$actions = Db::pdo()->query('SELECT DISTINCT action FROM audit_log ORDER BY action')->fetchAll(PDO::FETCH_COLUMN);

function qs(array $overrides): string
{
    $params = array_merge($_GET, $overrides);
    return '?' . http_build_query(array_filter($params, fn($v) => $v !== ''));
}

$pageTitle = 'Audit Log';
$activeNav = 'audit';
include __DIR__ . '/../partials/header.php';
?>
<h1>Audit Log</h1>
<div class="sub"><?= $result['total'] ?> event<?= $result['total'] === 1 ? '' : 's' ?> - logins, user changes, case lifecycle, policy-setting changes.</div>

<form method="get" class="toolbar">
  <select name="actor">
    <option value="">All users</option>
    <?php foreach ($users as $u): ?>
      <option value="<?= (int) $u['id'] ?>" <?= (string) $u['id'] === (string) ($filters['actor_user_id']) ? 'selected' : '' ?>><?= e($u['name']) ?></option>
    <?php endforeach; ?>
  </select>
  <select name="action">
    <option value="">All actions</option>
    <?php foreach ($actions as $a): ?>
      <option value="<?= e($a) ?>" <?= $a === $filters['action'] ? 'selected' : '' ?>><?= e($a) ?></option>
    <?php endforeach; ?>
  </select>
  <input type="text" name="from" placeholder="From (YYYY-MM-DD)" value="<?= e($filters['from']) ?>" style="width:160px">
  <input type="text" name="to" placeholder="To (YYYY-MM-DD)" value="<?= e($filters['to']) ?>" style="width:160px">
  <button class="btn small" type="submit">Filter</button>
  <a class="btn small secondary" href="/admin/audit.php">Reset</a>
</form>

<div class="card">
  <div class="card-body">
    <div class="tbl-wrap"><table class="data">
      <thead><tr><th>When (UTC)</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th><th>IP</th></tr></thead>
      <tbody>
      <?php foreach ($result['rows'] as $a): ?>
        <tr>
          <td><?= e(substr((string) $a['created_at'], 0, 19)) ?></td>
          <td><?= e($a['actor_name'] ?? ($a['actor_username'] ?? 'system')) ?></td>
          <td><?= e($a['action']) ?></td>
          <td><?= e($a['target_type'] ? $a['target_type'] . ' #' . $a['target_id'] : '-') ?></td>
          <td style="max-width:340px;white-space:normal;word-break:break-word;font-size:12px;color:var(--muted)">
            <?= e($a['details'] ?: '') ?>
          </td>
          <td><?= e($a['ip_address'] ?: '-') ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table></div>

    <div class="pagination">
      <?php for ($p = 1; $p <= $totalPages; $p++): ?>
        <?php if ($p === $page): ?>
          <span class="cur"><?= $p ?></span>
        <?php else: ?>
          <a href="<?= e(qs(['page' => (string) $p])) ?>"><?= $p ?></a>
        <?php endif; ?>
      <?php endfor; ?>
    </div>
  </div>
</div>
<?php include __DIR__ . '/../partials/footer.php'; ?>
