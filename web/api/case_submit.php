<?php
declare(strict_types=1);
require_once __DIR__ . '/../../app/bootstrap.php';

$user = Auth::user();
if (!$user) {
    Http::jsonOut(['ok' => false, 'error' => 'Not logged in.'], 401);
}
Rbac::requireRole($user, ['normal']);
if ((int) $user['must_change_password'] === 1) {
    Http::jsonOut(['ok' => false, 'error' => 'Change your password before submitting a case.'], 403);
}

$body = Http::jsonIn();
if ($body === false) {
    Http::jsonOut(['ok' => false, 'error' => 'Invalid request body.'], 400);
}
Csrf::requireValid($body['csrf'] ?? null);

$mode = (string) ($body['mode'] ?? '');
$checkerId = (int) ($body['checker_id'] ?? 0);
$snapshot = $body['snapshot'] ?? null;

$validModes = ['pf', 'hf', 'cc', 'pf-cc', 'hf-cc', 'pf-hf'];
if (!in_array($mode, $validModes, true)) {
    Http::jsonOut(['ok' => false, 'error' => 'Invalid mode.'], 400);
}
if (!is_array($snapshot) || empty($snapshot['state'])) {
    Http::jsonOut(['ok' => false, 'error' => 'Missing case data.'], 400);
}

$chk = Db::pdo()->prepare("SELECT id FROM users WHERE id = :id AND role = 'checker' AND status = 'active'");
$chk->execute([':id' => $checkerId]);
if (!$chk->fetch()) {
    Http::jsonOut(['ok' => false, 'error' => 'Choose a valid, active checker.'], 400);
}

$customer = $snapshot['state']['customer'] ?? [];
if (empty($customer['name']) || empty($customer['ic'])) {
    Http::jsonOut(['ok' => false, 'error' => 'Customer name and IC are required before submitting.'], 400);
}

$id = Cases::submit((int) $user['id'], $checkerId, $mode, $snapshot);
$case = Cases::find($id);

Http::jsonOut(['ok' => true, 'id' => $id, 'reference' => $case['reference']]);
