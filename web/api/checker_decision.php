<?php
declare(strict_types=1);
require_once __DIR__ . '/../../app/bootstrap.php';

$user = Auth::user();
if (!$user) {
    Http::jsonOut(['ok' => false, 'error' => 'Not logged in.'], 401);
}
Rbac::requireRole($user, ['checker']);

$body = Http::jsonIn();
if ($body === false) {
    Http::jsonOut(['ok' => false, 'error' => 'Invalid request body.'], 400);
}
Csrf::requireValid($body['csrf'] ?? null);

$caseId = (int) ($body['case_id'] ?? 0);
$decision = (string) ($body['decision'] ?? ''); // 'approved' | 'rejected'
$notes = isset($body['notes']) ? trim((string) $body['notes']) : null;

if (!in_array($decision, ['approved', 'rejected'], true)) {
    Http::jsonOut(['ok' => false, 'error' => 'Decision must be approved or rejected.'], 400);
}
if ($decision === 'rejected' && ($notes === null || $notes === '')) {
    Http::jsonOut(['ok' => false, 'error' => 'A reason is required when rejecting a case.'], 400);
}

$signoff = [];
if (isset($body['signoff']) && is_array($body['signoff'])) {
    foreach (['checkerName', 'checkerId', 'checkerDate', 'checkerSignature'] as $k) {
        if (isset($body['signoff'][$k])) {
            $signoff[$k] = (string) $body['signoff'][$k];
        }
    }
}

try {
    Cases::decide($caseId, (int) $user['id'], $decision, $notes ?: null, $signoff);
} catch (RuntimeException $e) {
    Http::jsonOut(['ok' => false, 'error' => $e->getMessage()], 409);
}

Http::jsonOut(['ok' => true]);
