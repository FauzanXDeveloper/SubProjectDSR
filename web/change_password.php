<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/bootstrap.php';

$user = Auth::requireLogin();
$forced = (int) $user['must_change_password'] === 1;
$error = '';
$done = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    Csrf::requireValid($_POST['csrf'] ?? null);
    $current = (string) ($_POST['current_password'] ?? '');
    $new = (string) ($_POST['new_password'] ?? '');
    $confirm = (string) ($_POST['confirm_password'] ?? '');

    if (!password_verify($current, $user['password_hash'])) {
        $error = 'Current password is incorrect.';
    } elseif (strlen($new) < 8) {
        $error = 'New password must be at least 8 characters.';
    } elseif ($new !== $confirm) {
        $error = 'New password and confirmation do not match.';
    } elseif (password_verify($new, $user['password_hash'])) {
        $error = 'New password must be different from the current one.';
    } else {
        Auth::changePassword((int) $user['id'], $new);
        $done = true;
        $user = Auth::user();
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Change password | ARBM DSR Calculator</title>
<link rel="icon" type="image/png" href="/public/favicon.png">
<link rel="stylesheet" href="/css/styles.css">
<link rel="stylesheet" href="/css/app.css">
</head>
<body>
<div class="auth-wrap">
  <div class="auth-bg-blob b1"></div>
  <div class="auth-bg-blob b2"></div>
  <div class="auth-bg-blob b3"></div>
  <div class="auth-box">
    <div class="abrand">
      <img src="/public/alrajhi_logo.png" alt="Al Rajhi Bank">
      <div class="t">Financing &amp; DSR Calculator<br>Internal Credit Evaluation System</div>
    </div>
    <h1 class="auth-title">Change password</h1>
    <p class="auth-sub"><?= $forced ? 'You must set a new password before continuing.' : 'Update the password for your account.' ?></p>

    <?php if ($done): ?>
      <div class="notice info">Password updated.
        <a href="/dashboard.php">Continue to dashboard &rarr;</a></div>
    <?php else: ?>
      <?php if ($error): ?><div class="auth-err"><?= e($error) ?></div><?php endif; ?>
      <form method="post" autocomplete="off">
        <?= Csrf::field() ?>
        <label for="current_password">Current password</label>
        <div class="auth-field">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>
          <input type="password" id="current_password" name="current_password" autocomplete="current-password" required autofocus>
        </div>
        <label for="new_password">New password (min. 8 characters)</label>
        <div class="auth-field">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/><circle cx="12" cy="15.2" r="1.4"/></svg>
          <input type="password" id="new_password" name="new_password" autocomplete="new-password" minlength="8" required>
        </div>
        <label for="confirm_password">Confirm new password</label>
        <div class="auth-field">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/><path d="m9.5 15.5 1.6 1.6 3.2-3.2"/></svg>
          <input type="password" id="confirm_password" name="confirm_password" autocomplete="new-password" minlength="8" required>
        </div>
        <button class="btn" type="submit">Update password</button>
      </form>
      <?php if (!$forced): ?><p class="auth-foot"><a href="/dashboard.php">&larr; Back to dashboard</a></p><?php endif; ?>
    <?php endif; ?>
  </div>
</div>
</body>
</html>
<?php
/*
 * WHAT THIS PAGE DOES (in plain language)
 * ----------------------------------------
 * This is the "change my password" screen. It's shown either because
 * the user chose to update their password, or because an admin flagged
 * their account as needing a mandatory password change before they can
 * do anything else (e.g. right after account creation).
 *
 * - On submit, it checks the anti-forgery token, verifies the current
 *   password is correct, and makes sure the new password is at least
 *   8 characters, matches its confirmation field, and is actually
 *   different from the old one.
 * - If everything checks out, Auth::changePassword() saves the new
 *   password and the page shows a success message with a link to the
 *   dashboard. If a mandatory change was in effect, that flag is
 *   cleared so the user isn't asked again.
 * - If anything fails validation, the form is redisplayed with an
 *   explanation of what needs fixing.
 */
