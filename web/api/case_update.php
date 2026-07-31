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

/*
 * WHAT THIS FILE DOES (in plain language)
 * ----------------------------------------
 * A backend "API" endpoint used to save edits to a case that already
 * exists (e.g. a preparer updating figures on a case still in
 * progress). The calculator page calls this quietly in the background.
 *
 * Steps: confirm the caller is logged in and has the "normal"
 * (preparer) role, check the anti-forgery token, make sure the
 * customer's name and IC number are present, then pass everything to
 * Cases::update() to save it. If the case can't be updated (e.g. it's
 * already been decided), it replies with an error instead of crashing.
 */
