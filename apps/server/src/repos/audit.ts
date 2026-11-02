import type { Db } from '../db/database.js';

export type AuditEntry = {
  id: number;
  at: number;
  actorId: number | null;
  actor: string | null;
  action: string;
  target: string | null;
  detail: unknown;
};

type Row = { id: number; at: number; actor_id: number | null; actor: string | null; action: string; target: string | null; detail: string | null };

// Nhật ký hoạt động cho admin: đăng nhập, tài khoản, đề bài, nộp bài, chấm, duyệt điểm.
export function createAuditRepo(db: Db, now: () => number = Date.now) {
  return {
    log(actorId: number | null, action: string, target?: string, detail?: unknown): void {
      db.prepare('INSERT INTO audit_log (at, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)').run(
        now(),
        actorId,
        action,
        target ?? null,
        detail === undefined ? null : JSON.stringify(detail),
      );
    },
    list(limit = 200, offset = 0): AuditEntry[] {
      const rows = db
        .prepare(
          'SELECT a.*, u.username AS actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ? OFFSET ?',
        )
        .all(limit, offset) as Row[];
      return rows.map((r) => ({
        id: r.id,
        at: r.at,
        actorId: r.actor_id,
        actor: r.actor,
        action: r.action,
        target: r.target,
        detail: r.detail ? JSON.parse(r.detail) : null,
      }));
    },
  };
}

export type AuditRepo = ReturnType<typeof createAuditRepo>;
