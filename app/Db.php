<?php
/**
 * PDO singleton over storage/dsr.sqlite. Auto-applies migrations/schema.sql
 * the first time the database file doesn't exist yet, so setup is just
 * "run bin/seed_admin.php" - no manual DB step. storage/ sits outside
 * web/ (the PHP docroot) so the .sqlite file is never reachable by URL.
 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $storageDir = dirname(__DIR__) . '/storage';
        if (!is_dir($storageDir)) {
            mkdir($storageDir, 0770, true);
        }
        $dbFile = $storageDir . '/dsr.sqlite';
        $needsInit = !file_exists($dbFile);

        $pdo = new PDO('sqlite:' . $dbFile);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA journal_mode = WAL');

        if ($needsInit) {
            $schema = file_get_contents(dirname(__DIR__) . '/migrations/schema.sql');
            $pdo->exec($schema);
        }

        self::$pdo = $pdo;
        return $pdo;
    }

    /** ISO-8601 UTC timestamp, consistent with the schema's default columns. */
    public static function now(): string
    {
        return gmdate('Y-m-d\TH:i:s.000\Z');
    }
}
