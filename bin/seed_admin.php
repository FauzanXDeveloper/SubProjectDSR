<?php
/**
 * One-time CLI bootstrap: creates the database (auto-applies
 * migrations/schema.sql) and the first admin account, since only an
 * admin can create other users and there's nothing to log in with yet.
 *
 * Usage: php bin/seed_admin.php [username] [name]
 *   Prints a randomly generated password ONCE - note it down, you'll be
 *   forced to change it on first login.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("This script is for command-line use only.\n");
}

require_once __DIR__ . '/../app/Db.php';
require_once __DIR__ . '/../app/Audit.php';

$username = $argv[1] ?? 'admin';
$name = $argv[2] ?? 'System Administrator';

$pdo = Db::pdo(); // creates + migrates storage/dsr.sqlite if needed

$stmt = $pdo->prepare('SELECT id FROM users WHERE username = :u');
$stmt->execute([':u' => $username]);
if ($stmt->fetch()) {
    fwrite(STDERR, "A user named \"$username\" already exists. Nothing to do.\n");
    exit(1);
}

$password = bin2hex(random_bytes(9)); // 18-char random temp password
$hash = password_hash($password, PASSWORD_BCRYPT);

$ins = $pdo->prepare(
    'INSERT INTO users (username, name, email, password_hash, role, status, must_change_password, created_at, updated_at)
     VALUES (:u, :n, NULL, :h, "admin", "active", 1, :now, :now)'
);
$ins->execute([':u' => $username, ':n' => $name, ':h' => $hash, ':now' => Db::now()]);
$id = (int) $pdo->lastInsertId();

Audit::log($id, 'USER_CREATED', 'user', $id, ['username' => $username, 'role' => 'admin', 'via' => 'seed_admin.php']);

echo "Admin account created.\n";
echo "  username: $username\n";
echo "  password: $password   (temporary - you must change it on first login)\n";
