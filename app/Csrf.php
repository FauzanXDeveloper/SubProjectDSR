<?php
/** One CSRF token per session, required on every state-changing request. */
final class Csrf
{
    public static function token(): string
    {
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf'];
    }

    public static function field(): string
    {
        return '<input type="hidden" name="csrf" value="' . htmlspecialchars(self::token(), ENT_QUOTES) . '">';
    }

    public static function valid(?string $token): bool
    {
        return is_string($token) && !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
    }

    /** Call at the top of every POST handler; ends the request on failure. */
    public static function requireValid(?string $token): void
    {
        if (!self::valid($token)) {
            Http::deny(403, 'Invalid or expired form token. Please reload the page and try again.');
        }
    }
}
