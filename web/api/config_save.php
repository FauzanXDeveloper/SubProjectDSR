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

/*
 * WHAT THIS FILE DOES (in plain language)
 * ----------------------------------------
 * This is a backend "API" endpoint, not a page a person looks at - the
 * admin settings page calls this in the background (via JavaScript) to
 * save policy/config changes (e.g. DSR thresholds, rates).
 *
 * Steps: confirm someone is logged in, confirm they're an admin, read
 * the JSON the browser sent, check the anti-forgery (CSRF) token, then
 * hand the new config off to PolicyConfig::save() to store it. It
 * replies with a small JSON message ({"ok": true} or an error) that the
 * browser's JavaScript reads to know whether the save worked.
 */
