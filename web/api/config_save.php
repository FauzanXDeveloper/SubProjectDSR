<?php
declare(strict_types=1);
require_once __DIR__ . '/../../app/bootstrap.php';

$user = Auth::user();
if (!$user) {
    Http::jsonOut(['ok' => false, 'error' => 'Not logged in.'], 401);
}
Rbac::requireRole($user, ['admin']);

$body = Http::jsonIn();
if ($body === false || !isset($body['config']) || !is_array($body['config'])) {
    Http::jsonOut(['ok' => false, 'error' => 'Invalid request body.'], 400);
}
Csrf::requireValid($body['csrf'] ?? null);

PolicyConfig::save($body['config'], (int) $user['id']);
Http::jsonOut(['ok' => true]);
