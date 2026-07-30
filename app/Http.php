<?php
/**
 * HTTP response helpers. noStore() is called by bootstrap.php on every
 * request so nothing sensitive (customer income, IC, CCRIS data, session
 * pages) is retained by disk cache or the browser's back/forward cache -
 * the closest a server can get to "never saved in the browser" for pages
 * it renders.
 */
final class Http
{
    public static function noStore(): void
    {
        header('Cache-Control: no-store, no-cache, must-revalidate, private');
        header('Pragma: no-cache');
        header('Expires: 0');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
    }

    public static function jsonOut(array $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data);
        exit;
    }

    /** Read + decode a JSON request body; false on bad/empty input. */
    public static function jsonIn(): array|false
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return false;
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : false;
    }

    public static function redirect(string $to): never
    {
        header('Location: ' . $to);
        exit;
    }

    public static function deny(int $status, string $message): never
    {
        http_response_code($status);
        header('Content-Type: text/plain; charset=utf-8');
        echo $message;
        exit;
    }
}
