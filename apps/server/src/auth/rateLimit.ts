import type { Db } from '../db/database.js';

// Chống dò mật khẩu: đếm lần sai theo khoá (vd. "user:nam", "ip:1.2.3.4"); sai đủ maxFailures thì khoá lockMs.
export function createLoginLimiter(db: Db, opts: { maxFailures?: number; lockMs?: number; now?: () => number } = {}) {
  const max = opts.maxFailures ?? 5;
  const lockMs = opts.lockMs ?? 15 * 60_000;
  const now = opts.now ?? Date.now;
  const read = (key: string) =>
    db.prepare('SELECT failures, locked_until FROM login_attempts WHERE key = ?').get(key) as
      | { failures: number; locked_until: number | null }
      | undefined;

  return {
    isLocked(key: string): boolean {
      const r = read(key);
      if (!r?.locked_until) return false;
      if (r.locked_until > now()) return true;
      db.prepare('DELETE FROM login_attempts WHERE key = ?').run(key);
      return false;
    },
    fail(key: string): void {
      const r = read(key);
      const lockExpired = r?.locked_until != null && r.locked_until <= now();
      const failures = (lockExpired ? 0 : (r?.failures ?? 0)) + 1;
      const lockedUntil = failures >= max ? now() + lockMs : null;
      db.prepare(
        'INSERT INTO login_attempts (key, failures, locked_until) VALUES (?, ?, ?) ' +
          'ON CONFLICT (key) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until',
      ).run(key, failures, lockedUntil);
    },
    succeed(key: string): void {
      db.prepare('DELETE FROM login_attempts WHERE key = ?').run(key);
    },
  };
}

export type LoginLimiter = ReturnType<typeof createLoginLimiter>;
