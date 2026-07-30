<?php
/**
 * Session-based auth. Roles: normal (maker), checker, admin.
 * Hardening: bcrypt passwords, per-account lockout after repeated failures,
 * session id regenerated on login, idle timeout, no-store headers applied
 * by bootstrap.php on every page (see app/Http.php).
 */
final class Auth
{
    private const MAX_ATTEMPTS = 5;
    private const LOCK_MINUTES = 15;
    private const IDLE_TIMEOUT_SECONDS = 30 * 60;

    /** null = not looked up yet this request; false = looked up, not logged in; array = the user row. */
    private static array|false|null $cachedUser = null;

    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        session_name('dsr_session');
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        session_start();

        // idle timeout: a session with no activity for too long is dead,
        // even though the cookie itself has no fixed expiry
        if (!empty($_SESSION['user_id']) && !empty($_SESSION['last_activity'])
            && (time() - $_SESSION['last_activity']) > self::IDLE_TIMEOUT_SECONDS) {
            self::destroySession();
        }
        $_SESSION['last_activity'] = time();
    }

    private static function destroySession(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
    }

    public static function user(): ?array
    {
        if (self::$cachedUser !== null) {
            return self::$cachedUser ?: null;
        }
        if (empty($_SESSION['user_id'])) {
            self::$cachedUser = false;
            return null;
        }
        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE id = :id AND status = "active"');
        $stmt->execute([':id' => $_SESSION['user_id']]);
        $row = $stmt->fetch();
        if (!$row) {
            self::destroySession();
            self::$cachedUser = false;
            return null;
        }
        self::$cachedUser = $row;
        return $row;
    }

    public static function requireLogin(): array
    {
        $user = self::user();
        if (!$user) {
            Http::redirect('/login.php');
        }
        // force a password change before anything else, except on the
        // change-password/logout pages themselves
        $script = basename($_SERVER['SCRIPT_NAME'] ?? '');
        if ((int) $user['must_change_password'] === 1 && !in_array($script, ['change_password.php', 'logout.php'], true)) {
            Http::redirect('/change_password.php');
        }
        return $user;
    }

    /** @return array{ok:bool, error?:string} */
    public static function attempt(string $username, string $password): array
    {
        $pdo = Db::pdo();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE username = :u');
        $stmt->execute([':u' => $username]);
        $row = $stmt->fetch();

        if (!$row) {
            // don't reveal whether the username exists
            Audit::log(null, 'LOGIN_FAILED', 'user', null, ['username' => $username, 'reason' => 'no_such_user']);
            return ['ok' => false, 'error' => 'Invalid username or password.'];
        }

        if ($row['status'] !== 'active') {
            Audit::log((int) $row['id'], 'LOGIN_FAILED', 'user', (int) $row['id'], ['reason' => 'disabled']);
            return ['ok' => false, 'error' => 'This account has been disabled. Contact an administrator.'];
        }

        if (!empty($row['locked_until']) && $row['locked_until'] > Db::now()) {
            Audit::log((int) $row['id'], 'LOGIN_FAILED', 'user', (int) $row['id'], ['reason' => 'locked']);
            return ['ok' => false, 'error' => 'Too many failed attempts. Try again in a few minutes.'];
        }

        if (!password_verify($password, $row['password_hash'])) {
            $attempts = (int) $row['failed_attempts'] + 1;
            $lockedUntil = null;
            if ($attempts >= self::MAX_ATTEMPTS) {
                $lockedUntil = gmdate('Y-m-d\TH:i:s.000\Z', time() + self::LOCK_MINUTES * 60);
                $attempts = 0;
            }
            $upd = $pdo->prepare('UPDATE users SET failed_attempts = :a, locked_until = :l, updated_at = :now WHERE id = :id');
            $upd->execute([':a' => $attempts, ':l' => $lockedUntil, ':now' => Db::now(), ':id' => $row['id']]);
            Audit::log((int) $row['id'], 'LOGIN_FAILED', 'user', (int) $row['id'], ['reason' => 'bad_password']);
            return ['ok' => false, 'error' => 'Invalid username or password.'];
        }

        // success: reset throttling, regenerate session id (prevents fixation)
        $upd = $pdo->prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = :now, updated_at = :now WHERE id = :id');
        $upd->execute([':now' => Db::now(), ':id' => $row['id']]);

        session_regenerate_id(true);
        $_SESSION['user_id'] = (int) $row['id'];
        $_SESSION['last_activity'] = time();
        self::$cachedUser = null;

        Audit::log((int) $row['id'], 'LOGIN_SUCCESS', 'user', (int) $row['id']);
        return ['ok' => true];
    }

    public static function logout(): void
    {
        $user = self::user();
        if ($user) {
            Audit::log((int) $user['id'], 'LOGOUT', 'user', (int) $user['id']);
        }
        self::destroySession();
    }

    public static function changePassword(int $userId, string $newPassword): void
    {
        $hash = password_hash($newPassword, PASSWORD_BCRYPT);
        $stmt = Db::pdo()->prepare('UPDATE users SET password_hash = :h, must_change_password = 0, updated_at = :now WHERE id = :id');
        $stmt->execute([':h' => $hash, ':now' => Db::now(), ':id' => $userId]);
        self::$cachedUser = null;
        Audit::log($userId, 'PASSWORD_CHANGED', 'user', $userId);
    }
}
