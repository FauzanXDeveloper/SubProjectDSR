<?php
/** Role gate. Call after Auth::requireLogin(). */
final class Rbac
{
    /** @param string[] $roles */
    public static function requireRole(array $user, array $roles): void
    {
        if (!in_array($user['role'], $roles, true)) {
            Http::deny(403, 'You do not have permission to view this page.');
        }
    }
}
