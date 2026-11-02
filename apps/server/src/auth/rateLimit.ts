import type { Db } from '../db/database.js';

// Chống dò mật khẩu: đếm lần sai theo khoá (vd. "user:nam", "ip:1.2.3.4") trong khung windowMs tính từ lần sai
// đầu; sai đủ maxFailures trong khung thì khoá lockMs. Hết khung hoặc hết khoá thì đếm lại từ đầu.
export function createLoginLimiter(db: Db, opts: { maxFailures?: number; lockMs?: number; windowMs?: number; now?: () => number } = {}) {
  const max = opts.maxFailures ?? 5;
  const lockMs = opts.lockMs ?? 15 * 60_000;
  const windowMs = opts.windowMs ?? lockMs;
  const now = opts.now ?? Date.now;
  const read = (key: string) =>
    db.prepare('SELECT failures, locked_until, first_failure_at FROM login_attempts WHERE key = ?').get(key) as
      | { failures: number; locked_until: number | null; first_failure_at: number }
      | undefined;
  // Bản ghi còn hiệu lực: đang khoá, hoặc chưa khoá nhưng lần sai đầu còn trong khung.
  const live = (r: { locked_until: number | null; first_failure_at: number }, t: number) =>
    r.locked_until != null ? r.locked_until > t : r.first_failure_at + windowMs > t;

  return {
    isLocked(key: string): boolean {
      const r = read(key);
      if (!r?.locked_until) return false;
      if (r.locked_until > now()) return true;
      db.prepare('DELETE FROM login_attempts WHERE key = ?').run(key);
      return false;
    },
    fail(key: string): void {
      const t = now();
      const r = read(key);
      const fresh = !r || !live(r, t);
      const failures = fresh ? 1 : r.failures + 1;
      const lockedUntil = failures >= max ? t + lockMs : null;
      db.prepare(
        'INSERT INTO login_attempts (key, failures, locked_until, first_failure_at) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT (key) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until, first_failure_at = excluded.first_failure_at',
      ).run(key, failures, lockedUntil, fresh ? t : r.first_failure_at);
    },
    succeed(key: string): void {
      db.prepare('DELETE FROM login_attempts WHERE key = ?').run(key);
    },
    /** Xoá bản ghi đã hết hiệu lực (gọi định kỳ để bảng không phình theo mỗi tên đăng nhập bị dò). Trả số dòng đã xoá. */
    purge(): number {
      const t = now();
      return Number(
        db
          .prepare('DELETE FROM login_attempts WHERE (locked_until IS NOT NULL AND locked_until <= ?) OR (locked_until IS NULL AND first_failure_at + ? <= ?)')
          .run(t, windowMs, t).changes,
      );
    },
  };
}

export type LoginLimiter = ReturnType<typeof createLoginLimiter>;
