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

/*
 * WHAT THIS FILE DOES (in plain language)
 * ----------------------------------------
 * A backend "API" endpoint used when a preparer finishes a calculation
 * and submits a brand-new case for a checker to review. The calculator
 * page calls this quietly when the "Submit" button is clicked.
 *
 * Steps: confirm the caller is logged in, has the "normal" (preparer)
 * role, and isn't forced to change their password first. Then check
 * the anti-forgery token, validate the financing "mode" (e.g. PF, HF,
 * CC, or a combination), confirm a valid active checker was chosen,
 * and confirm the customer's name and IC number were entered. If all
 * checks pass, Cases::submit() creates the case record and this page
 * replies with the new case's ID and reference number.
 */
