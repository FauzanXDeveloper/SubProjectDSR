<?php
/**
 * Calculation policy overrides (rates/thresholds edited on admin/settings.php).
 * Replaces the old localStorage['dsrConfigOverrides'] - single DB row,
 * read by every page that loads js/engine/config.js and injects it as
 * window.__DSR_CONFIG_OVERRIDES before that script runs.
 */
final class PolicyConfig
{
    public static function raw(): array
    {
        $stmt = Db::pdo()->query('SELECT config_json, updated_at FROM policy_config WHERE id = 1');
        $row = $stmt->fetch();
        return $row ?: ['config_json' => '{}', 'updated_at' => null];
    }

    public static function hasOverrides(): bool
    {
        return self::raw()['config_json'] !== '{}';
    }

    /** @return array|null decoded overrides, or null if none saved */
    public static function overrides(): ?array
    {
        $raw = self::raw()['config_json'];
        if ($raw === '{}' || $raw === '' || $raw === null) {
            return null;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    public static function save(array $overrides, int $userId): void
    {
        $json = json_encode(empty($overrides) ? new stdClass() : $overrides);
        $stmt = Db::pdo()->prepare('UPDATE policy_config SET config_json = :c, updated_by = :u, updated_at = :now WHERE id = 1');
        $stmt->execute([':c' => $json, ':u' => $userId, ':now' => Db::now()]);
        Audit::log($userId, 'CONFIG_UPDATED', 'config', 1);
    }
}
