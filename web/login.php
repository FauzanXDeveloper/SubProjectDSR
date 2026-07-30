<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/bootstrap.php';

// already logged in -> go straight to the dashboard
if (Auth::user()) {
    Http::redirect('/dashboard.php');
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    Csrf::requireValid($_POST['csrf'] ?? null);
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    if ($username === '' || $password === '') {
        $error = 'Enter your username and password.';
    } else {
        $result = Auth::attempt($username, $password);
        if ($result['ok']) {
            Http::redirect('/dashboard.php');
        }
        $error = $result['error'];
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign in | ARBM DSR Calculator</title>
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
    <h1 class="auth-title">Sign in</h1>
    <p class="auth-sub">Enter the credentials your administrator gave you.</p>
    <form method="post" autocomplete="off">
      <?= Csrf::field() ?>
      <label for="username">Username</label>
      <div class="auth-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
        <input type="text" id="username" name="username" autocomplete="username" required autofocus value="<?= e($_POST['username'] ?? '') ?>">
      </div>
      <label for="password">Password</label>
      <div class="auth-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>
        <input type="password" id="password" name="password" autocomplete="current-password" required>
      </div>
      <button class="btn" type="submit">Sign in</button>
      <?php if ($error): ?><div class="auth-err"><?= e($error) ?></div><?php endif; ?>
    </form>
    <p class="auth-foot">Need an account or a password reset? Contact your system administrator.</p>
  </div>
</div>
</body>
</html>
