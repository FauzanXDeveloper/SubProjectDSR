<?php
declare(strict_types=1);
require_once __DIR__ . '/../../app/bootstrap.php';

$user = Auth::user();
if (!$user) {
    Http::jsonOut(['ok' => false, 'error' => 'Not logged in.'], 401);
}
Rbac::requireRole($user, ['normal']);

$body = Http::jsonIn();
if ($body === false) {
    Http::jsonOut(['ok' => false, 'error' => 'Invalid request body.'], 400);
}
Csrf::requireValid($body['csrf'] ?? null);

$caseId = (int) ($body['case_id'] ?? 0);
$snapshot = $body['snapshot'] ?? null;
if (!is_array($snapshot) || empty($snapshot['state'])) {
    Http::jsonOut(['ok' => false, 'error' => 'Missing case data.'], 400);
}

$customer = $snapshot['state']['customer'] ?? [];
if (empty($customer['name']) || empty($customer['ic'])) {
    Http::jsonOut(['ok' => false, 'error' => 'Customer name and IC are required.'], 400);
}

try {
    Cases::update($caseId, (int) $user['id'], $snapshot);
} catch (RuntimeException $e) {
    Http::jsonOut(['ok' => false, 'error' => $e->getMessage()], 409);
}

Http::jsonOut(['ok' => true]);
