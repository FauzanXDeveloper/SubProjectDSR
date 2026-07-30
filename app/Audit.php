<?php
/** Append-only audit trail. Every login, user/case/config change writes here. */
final class Audit
{
    public static function log(?int $actorUserId, string $action, ?string $targetType = null, ?int $targetId = null, array $details = []): void
    {
        $stmt = Db::pdo()->prepare(
            'INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details, ip_address, created_at)
             VALUES (:actor, :action, :ttype, :tid, :details, :ip, :now)'
        );
        $stmt->execute([
            ':actor'   => $actorUserId,
            ':action'  => $action,
            ':ttype'   => $targetType,
            ':tid'     => $targetId,
            ':details' => $details ? json_encode($details) : null,
            ':ip'      => $_SERVER['REMOTE_ADDR'] ?? null,
            ':now'     => Db::now(),
        ]);
    }

    /**
     * @return array{rows: array<int,array>, total: int}
     */
    public static function search(array $filters, int $page, int $perPage = 50): array
    {
        $where = [];
        $params = [];
        if (!empty($filters['actor_user_id'])) {
            $where[] = 'actor_user_id = :actor';
            $params[':actor'] = $filters['actor_user_id'];
        }
        if (!empty($filters['action'])) {
            $where[] = 'action = :action';
            $params[':action'] = $filters['action'];
        }
        if (!empty($filters['from'])) {
            $where[] = 'created_at >= :from';
            $params[':from'] = $filters['from'];
        }
        if (!empty($filters['to'])) {
            $where[] = 'created_at <= :to';
            $params[':to'] = $filters['to'];
        }
        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        $countStmt = Db::pdo()->prepare("SELECT COUNT(*) FROM audit_log $whereSql");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $offset = max(0, ($page - 1) * $perPage);
        $stmt = Db::pdo()->prepare(
            "SELECT a.*, u.username AS actor_username, u.name AS actor_name
             FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
             $whereSql ORDER BY a.id DESC LIMIT :lim OFFSET :off"
        );
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['rows' => $stmt->fetchAll(), 'total' => $total];
    }
}
