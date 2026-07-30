<?php
/** Repository helpers for the cases table (create/list/get with access checks). */
final class Cases
{
    public static function nextReference(): string
    {
        $year = gmdate('Y');
        $stmt = Db::pdo()->prepare("SELECT COUNT(*) FROM cases WHERE reference LIKE :p");
        $stmt->execute([':p' => "DSR-$year-%"]);
        $n = (int) $stmt->fetchColumn() + 1;
        return sprintf('DSR-%s-%06d', $year, $n);
    }

    /** Create a submitted case directly (maker -> chosen checker). */
    public static function submit(int $makerId, int $checkerId, string $mode, array $snapshot): int
    {
        $state = $snapshot['state'] ?? [];
        $results = $snapshot['results'] ?? [];
        $computed = $snapshot['computed'] ?? [];

        $customer = $state['customer'] ?? [];
        $now = Db::now();
        $reference = self::nextReference();

        $stmt = Db::pdo()->prepare(
            'INSERT INTO cases (reference, created_by, assigned_checker_id, mode, status,
                customer_name, customer_ic, customer_type, customer_class, iscore, report_date,
                gross_income, net_income, verdict, dsr_value, ndi_value, payload_json,
                submitted_at, created_at, updated_at)
             VALUES (:reference, :maker, :checker, :mode, "pending_checker",
                :cname, :cic, :ctype, :cclass, :iscore, :rdate,
                :gross, :net, :verdict, :dsr, :ndi, :payload,
                :now, :now, :now)'
        );
        $stmt->execute([
            ':reference' => $reference,
            ':maker'     => $makerId,
            ':checker'   => $checkerId,
            ':mode'      => $mode,
            ':cname'     => $customer['name'] ?? null,
            ':cic'       => $customer['ic'] ?? null,
            ':ctype'     => $customer['type'] ?? null,
            ':cclass'    => $customer['cardType'] ?? null,
            ':iscore'    => (($state['iScore'] ?? '') !== '') ? $state['iScore'] : null,
            ':rdate'     => $state['reportDate'] ?? null,
            ':gross'     => round((float) ($computed['grossIncome'] ?? 0), 2),
            ':net'       => round((float) ($computed['netIncome'] ?? 0), 2),
            ':verdict'   => $results['verdict'] ?? null,
            ':dsr'       => isset($results['dsr']) ? round((float) $results['dsr'], 4) : null,
            ':ndi'       => isset($results['ndi']) ? round((float) $results['ndi'], 2) : null,
            ':payload'   => json_encode($snapshot),
            ':now'       => $now,
        ]);
        $id = (int) Db::pdo()->lastInsertId();
        Audit::log($makerId, 'CASE_SUBMITTED', 'case', $id, ['reference' => $reference, 'checker_id' => $checkerId]);
        return $id;
    }

    public static function find(int $id): ?array
    {
        $stmt = Db::pdo()->prepare('SELECT * FROM cases WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** Read access: the maker who created it, the assigned checker, or any admin. */
    public static function canView(array $case, array $user): bool
    {
        return $user['role'] === 'admin'
            || (int) $case['created_by'] === (int) $user['id']
            || (int) $case['assigned_checker_id'] === (int) $user['id'];
    }

    /** @param array $checkerSignoff optional {checkerName,checkerId,checkerDate,checkerSignature} merged into the stored payload */
    public static function decide(int $id, int $checkerId, string $status, ?string $notes, array $checkerSignoff = []): void
    {
        if (!in_array($status, ['approved', 'rejected'], true)) {
            throw new InvalidArgumentException('bad status');
        }
        $pdo = Db::pdo();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT payload_json FROM cases WHERE id = :id AND assigned_checker_id = :checker AND status = "pending_checker"');
            $stmt->execute([':id' => $id, ':checker' => $checkerId]);
            $row = $stmt->fetch();
            if (!$row) {
                throw new RuntimeException('Case not found, not assigned to you, or already decided.');
            }

            $payload = json_decode($row['payload_json'], true) ?: [];
            if ($checkerSignoff && isset($payload['state']) && is_array($payload['state'])) {
                $payload['state']['signoff'] = array_merge($payload['state']['signoff'] ?? [], $checkerSignoff);
            }

            $now = Db::now();
            $upd = $pdo->prepare(
                'UPDATE cases SET status = :status, decided_at = :now, decision_notes = :notes, payload_json = :payload, updated_at = :now
                 WHERE id = :id AND assigned_checker_id = :checker AND status = "pending_checker"'
            );
            $upd->execute([
                ':status' => $status, ':now' => $now, ':notes' => $notes,
                ':payload' => json_encode($payload), ':id' => $id, ':checker' => $checkerId,
            ]);
            if ($upd->rowCount() === 0) {
                throw new RuntimeException('Case not found, not assigned to you, or already decided.');
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $case = self::find($id);
        Audit::log($checkerId, $status === 'approved' ? 'CASE_APPROVED' : 'CASE_REJECTED', 'case', $id, [
            'reference' => $case['reference'] ?? null,
            'notes'     => $notes,
        ]);
    }

    /**
     * Maker correcting their own submission (typo, checker asked for a
     * smaller amount, etc.) - only while still pending_checker; once
     * decided the record is a closed audit trail and can no longer move.
     * Every edit is counted + timestamped so the checker/admin can see the
     * case was revised after the original submission.
     */
    public static function update(int $id, int $makerId, array $snapshot): void
    {
        $pdo = Db::pdo();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT id FROM cases WHERE id = :id AND created_by = :maker AND status = "pending_checker"');
            $stmt->execute([':id' => $id, ':maker' => $makerId]);
            if (!$stmt->fetch()) {
                throw new RuntimeException('Case not found, not yours, or no longer editable (already decided).');
            }

            $state = $snapshot['state'] ?? [];
            $results = $snapshot['results'] ?? [];
            $computed = $snapshot['computed'] ?? [];
            $customer = $state['customer'] ?? [];
            $now = Db::now();

            $upd = $pdo->prepare(
                'UPDATE cases SET
                    customer_name = :cname, customer_ic = :cic, customer_type = :ctype, customer_class = :cclass,
                    iscore = :iscore, report_date = :rdate, gross_income = :gross, net_income = :net,
                    verdict = :verdict, dsr_value = :dsr, ndi_value = :ndi, payload_json = :payload,
                    edit_count = edit_count + 1, edited_at = :now, updated_at = :now
                 WHERE id = :id AND created_by = :maker AND status = "pending_checker"'
            );
            $upd->execute([
                ':cname'  => $customer['name'] ?? null,
                ':cic'    => $customer['ic'] ?? null,
                ':ctype'  => $customer['type'] ?? null,
                ':cclass' => $customer['cardType'] ?? null,
                ':iscore' => (($state['iScore'] ?? '') !== '') ? $state['iScore'] : null,
                ':rdate'  => $state['reportDate'] ?? null,
                ':gross'  => round((float) ($computed['grossIncome'] ?? 0), 2),
                ':net'    => round((float) ($computed['netIncome'] ?? 0), 2),
                ':verdict' => $results['verdict'] ?? null,
                ':dsr'    => isset($results['dsr']) ? round((float) $results['dsr'], 4) : null,
                ':ndi'    => isset($results['ndi']) ? round((float) $results['ndi'], 2) : null,
                ':payload' => json_encode($snapshot),
                ':now' => $now, ':id' => $id, ':maker' => $makerId,
            ]);
            if ($upd->rowCount() === 0) {
                throw new RuntimeException('Case not found, not yours, or no longer editable (already decided).');
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $case = self::find($id);
        Audit::log($makerId, 'CASE_EDITED', 'case', $id, ['reference' => $case['reference'] ?? null]);
    }

    /** @return array<int,array> */
    public static function listForUser(array $user): array
    {
        $pdo = Db::pdo();
        if ($user['role'] === 'admin') {
            $stmt = $pdo->query(
                'SELECT c.*, m.name AS maker_name, k.name AS checker_name
                 FROM cases c
                 LEFT JOIN users m ON m.id = c.created_by
                 LEFT JOIN users k ON k.id = c.assigned_checker_id
                 ORDER BY c.id DESC'
            );
            return $stmt->fetchAll();
        }
        if ($user['role'] === 'checker') {
            $stmt = $pdo->prepare(
                'SELECT c.*, m.name AS maker_name, k.name AS checker_name
                 FROM cases c
                 LEFT JOIN users m ON m.id = c.created_by
                 LEFT JOIN users k ON k.id = c.assigned_checker_id
                 WHERE c.assigned_checker_id = :id ORDER BY c.id DESC'
            );
            $stmt->execute([':id' => $user['id']]);
            return $stmt->fetchAll();
        }
        $stmt = $pdo->prepare(
            'SELECT c.*, m.name AS maker_name, k.name AS checker_name
             FROM cases c
             LEFT JOIN users m ON m.id = c.created_by
             LEFT JOIN users k ON k.id = c.assigned_checker_id
             WHERE c.created_by = :id ORDER BY c.id DESC'
        );
        $stmt->execute([':id' => $user['id']]);
        return $stmt->fetchAll();
    }

    /** @return array<string,int> status => count */
    public static function statusCounts(): array
    {
        $stmt = Db::pdo()->query('SELECT status, COUNT(*) AS n FROM cases GROUP BY status');
        $out = ['draft' => 0, 'pending_checker' => 0, 'approved' => 0, 'rejected' => 0];
        foreach ($stmt->fetchAll() as $row) {
            $out[$row['status']] = (int) $row['n'];
        }
        return $out;
    }

    /** @return array<int,array> active checkers, for the maker's "submit to" picker */
    public static function activeCheckers(): array
    {
        $stmt = Db::pdo()->query("SELECT id, name, username FROM users WHERE role = 'checker' AND status = 'active' ORDER BY name");
        return $stmt->fetchAll();
    }
}
