<?php
/**
 * Included at the top of every page/endpoint under web/. Loads the app
 * classes, starts the hardened session, and sends no-store headers on
 * every response so authenticated pages are never cached to disk or
 * shown from the back/forward cache after logout.
 */
declare(strict_types=1);

require_once __DIR__ . '/Db.php';
require_once __DIR__ . '/Http.php';
require_once __DIR__ . '/Csrf.php';
require_once __DIR__ . '/Audit.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/Rbac.php';
require_once __DIR__ . '/Cases.php';
require_once __DIR__ . '/PolicyConfig.php';

Auth::startSession();
Http::noStore();

function e(?string $s): string
{
    return htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8');
}
