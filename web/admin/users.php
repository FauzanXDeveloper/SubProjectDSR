<?php
declare(strict_types=1);
require_once __DIR__ . '/../../app/bootstrap.php';

$admin = Auth::requireLogin();
Rbac::requireRole($admin, ['admin']);

$pdo = Db::pdo();
$notice = '';
$error = '';
$revealPassword = null; // [username, password] shown once after create/reset

function randomPassword(): string
{
    return bin2hex(random_bytes(9));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    Csrf::requireValid($_POST['csrf'] ?? null);
    $action = $_POST['action'] ?? '';

    if ($action === 'create') {
        $username = trim((string) ($_POST['username'] ?? ''));
        $name = mb_strtoupper(trim((string) ($_POST['name'] ?? '')));
        $staffId = trim((string) ($_POST['staff_id'] ?? ''));
        $email = trim((string) ($_POST['email'] ?? '')) ?: null;
        $role = (string) ($_POST['role'] ?? 'normal');

        if (!in_array($role, ['normal', 'checker', 'admin'], true)) {
            $error = 'Invalid role.';
        } elseif ($username === '' || $name === '' || $staffId === '') {
            $error = 'Username, name and staff ID are required.';
        } elseif (!preg_match('/^[a-zA-Z0-9._-]{3,32}$/', $username)) {
            $error = 'Username must be 3-32 characters: letters, numbers, dot, underscore, hyphen.';
        } elseif (!preg_match('/^[a-zA-Z0-9._-]{1,32}$/', $staffId)) {
            $error = 'Staff ID must be 1-32 characters: letters, numbers, dot, underscore, hyphen.';
        } else {
            $chk = $pdo->prepare('SELECT id FROM users WHERE username = :u');
            $chk->execute([':u' => $username]);
            if ($chk->fetch()) {
                $error = 'That username is already taken.';
            } else {
                $password = randomPassword();
                $ins = $pdo->prepare(
                    'INSERT INTO users (username, name, staff_id, email, password_hash, role, status, must_change_password, created_by, created_at, updated_at)
                     VALUES (:u, :n, :sid, :e, :h, :r, "active", 1, :by, :now, :now)'
                );
                $ins->execute([
                    ':u' => $username, ':n' => $name, ':sid' => $staffId, ':e' => $email,
                    ':h' => password_hash($password, PASSWORD_BCRYPT), ':r' => $role,
                    ':by' => $admin['id'], ':now' => Db::now(),
                ]);
                $newId = (int) $pdo->lastInsertId();
                Audit::log((int) $admin['id'], 'USER_CREATED', 'user', $newId, ['username' => $username, 'role' => $role]);
                $revealPassword = [$username, $password];
                $notice = "User \"$username\" created.";
            }
        }
    } elseif ($action === 'set_role') {
        $id = (int) ($_POST['id'] ?? 0);
        $role = (string) ($_POST['role'] ?? '');
        if ($id && in_array($role, ['normal', 'checker', 'admin'], true)) {
            if ($id === (int) $admin['id']) {
                $error = 'You cannot change your own role.';
            } else {
                $pdo->prepare('UPDATE users SET role = :r, updated_at = :now WHERE id = :id')
                    ->execute([':r' => $role, ':now' => Db::now(), ':id' => $id]);
                Audit::log((int) $admin['id'], 'USER_ROLE_CHANGED', 'user', $id, ['role' => $role]);
                $notice = 'Role updated.';
            }
        }
    } elseif ($action === 'set_status') {
        $id = (int) ($_POST['id'] ?? 0);
        $status = (string) ($_POST['status'] ?? '');
        if ($id && in_array($status, ['active', 'disabled'], true)) {
            if ($id === (int) $admin['id']) {
                $error = 'You cannot disable your own account.';
            } else {
                $pdo->prepare('UPDATE users SET status = :s, updated_at = :now WHERE id = :id')
                    ->execute([':s' => $status, ':now' => Db::now(), ':id' => $id]);
                Audit::log((int) $admin['id'], 'USER_DISABLED', 'user', $id, ['status' => $status]);
                $notice = 'Status updated.';
            }
        }
    } elseif ($action === 'set_staff_id') {
        $id = (int) ($_POST['id'] ?? 0);
        $staffId = trim((string) ($_POST['staff_id'] ?? ''));
        if (!$id || $staffId === '') {
            $error = 'Staff ID is required.';
        } elseif (!preg_match('/^[a-zA-Z0-9._-]{1,32}$/', $staffId)) {
            $error = 'Staff ID must be 1-32 characters: letters, numbers, dot, underscore, hyphen.';
        } else {
            $pdo->prepare('UPDATE users SET staff_id = :sid, updated_at = :now WHERE id = :id')
                ->execute([':sid' => $staffId, ':now' => Db::now(), ':id' => $id]);
            Audit::log((int) $admin['id'], 'USER_STAFF_ID_CHANGED', 'user', $id, ['staff_id' => $staffId]);
            $notice = 'Staff ID updated.';
        }
    } elseif ($action === 'reset_password') {
        $id = (int) ($_POST['id'] ?? 0);
        $row = $pdo->prepare('SELECT username FROM users WHERE id = :id');
        $row->execute([':id' => $id]);
        $u = $row->fetch();
        if ($u) {
            $password = randomPassword();
            $pdo->prepare('UPDATE users SET password_hash = :h, must_change_password = 1, updated_at = :now WHERE id = :id')
                ->execute([':h' => password_hash($password, PASSWORD_BCRYPT), ':now' => Db::now(), ':id' => $id]);
            Audit::log((int) $admin['id'], 'PASSWORD_RESET_BY_ADMIN', 'user', $id);
            $revealPassword = [$u['username'], $password];
            $notice = 'Password reset.';
        }
    }
}

$users = $pdo->query('SELECT * FROM users ORDER BY created_at DESC')->fetchAll();

$pageTitle = 'Users';
$activeNav = 'users';
include __DIR__ . '/../partials/header.php';
?>
<h1>Users</h1>
<div class="sub">Only admins can create accounts and assign roles (normal / checker / admin).</div>

<?php if ($notice): ?><div class="notice info"><?= e($notice) ?></div><?php endif; ?>
<?php if ($error): ?><div class="auth-err" style="margin-bottom:14px"><?= e($error) ?></div><?php endif; ?>
<?php if ($revealPassword): ?>
  <div class="notice">Temporary password for <b><?= e($revealPassword[0]) ?></b>:
    <code style="font-size:14px"><?= e($revealPassword[1]) ?></code>
    &mdash; shown once, note it down. The user must change it on first login.</div>
<?php endif; ?>

<div class="card">
  <div class="card-head"><span>New user</span></div>
  <div class="card-body">
    <form method="post" autocomplete="off">
      <?= Csrf::field() ?>
      <input type="hidden" name="action" value="create">
      <div class="grid c4">
        <div class="field"><label>Username</label><input type="text" name="username" required autocomplete="off"></div>
        <div class="field"><label>Full name</label><input type="text" name="name" required autocomplete="off" style="text-transform:uppercase"></div>
        <div class="field"><label>Staff ID</label><input type="text" name="staff_id" required autocomplete="off"></div>
        <div class="field"><label>Email (optional)</label><input type="text" name="email" autocomplete="off"></div>
        <div class="field"><label>Role</label>
          <select name="role">
            <option value="normal">Normal (maker)</option>
            <option value="checker">Checker</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <button class="btn" type="submit" style="margin-top:10px">Create user</button>
      <span class="sub" style="margin-left:10px">A random temporary password is generated and shown once; the user must change it at first login.</span>
    </form>
  </div>
</div>

<div class="card">
  <div class="card-head"><span>All users (<?= count($users) ?>)</span></div>
  <div class="card-body">
    <div class="tbl-wrap"><table class="data">
      <thead><tr><th>Username</th><th>Name</th><th>Staff ID</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($users as $u): ?>
        <tr>
          <td><?= e($u['username']) ?></td>
          <td><?= e($u['name']) ?></td>
          <td>
            <form method="post" style="display:inline-flex;gap:6px;align-items:center" onsubmit="return this.staff_id.value.trim() !== '';">
              <?= Csrf::field() ?>
              <input type="hidden" name="action" value="set_staff_id">
              <input type="hidden" name="id" value="<?= (int) $u['id'] ?>">
              <input type="text" name="staff_id" value="<?= e($u['staff_id'] ?? '') ?>" placeholder="-" style="width:90px" onblur="if(this.value.trim() && this.value !== this.defaultValue) this.form.requestSubmit();">
            </form>
          </td>
          <td><?= e($u['email'] ?: '-') ?></td>
          <td>
            <?php if ((int) $u['id'] === (int) $admin['id']): ?>
              <?= e($u['role']) ?>
            <?php else: ?>
              <form method="post" style="display:inline-flex;gap:6px;align-items:center">
                <?= Csrf::field() ?>
                <input type="hidden" name="action" value="set_role">
                <input type="hidden" name="id" value="<?= (int) $u['id'] ?>">
                <select name="role" onchange="this.form.submit()">
                  <?php foreach (['normal', 'checker', 'admin'] as $r): ?>
                    <option value="<?= $r ?>" <?= $u['role'] === $r ? 'selected' : '' ?>><?= ucfirst($r) ?></option>
                  <?php endforeach; ?>
                </select>
              </form>
            <?php endif; ?>
          </td>
          <td>
            <?php if ((int) $u['id'] === (int) $admin['id']): ?>
              <span class="status-pill approved">active (you)</span>
            <?php else: ?>
              <form method="post" style="display:inline">
                <?= Csrf::field() ?>
                <input type="hidden" name="action" value="set_status">
                <input type="hidden" name="id" value="<?= (int) $u['id'] ?>">
                <input type="hidden" name="status" value="<?= $u['status'] === 'active' ? 'disabled' : 'active' ?>">
                <button class="btn small secondary" type="submit"><?= $u['status'] === 'active' ? 'Disable' : 'Enable' ?></button>
              </form>
              <span class="status-pill <?= $u['status'] === 'active' ? 'approved' : 'rejected' ?>"><?= e($u['status']) ?></span>
            <?php endif; ?>
          </td>
          <td><?= e($u['last_login_at'] ? substr((string) $u['last_login_at'], 0, 19) : 'never') ?></td>
          <td>
            <form method="post" style="display:inline" onsubmit="return confirm('Reset password for <?= e($u['username']) ?>?');">
              <?= Csrf::field() ?>
              <input type="hidden" name="action" value="reset_password">
              <input type="hidden" name="id" value="<?= (int) $u['id'] ?>">
              <button class="btn small secondary" type="submit">Reset password</button>
            </form>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table></div>
  </div>
</div>
<?php include __DIR__ . '/../partials/footer.php'; ?>
