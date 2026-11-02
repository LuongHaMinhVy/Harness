import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@harness/shared/api';
import type { Db } from '../db/database.js';
import { createUserRepo } from '../repos/users.js';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Phiên đăng nhập: token ngẫu nhiên 32 byte gửi trong cookie; database chỉ lưu sha256(token),
// nên lộ file database cũng không dùng lại được phiên.
export function createSessionStore(db: Db, opts: { ttlMs?: number; now?: () => number } = {}) {
  const ttl = opts.ttlMs ?? SESSION_TTL_MS;
  const now = opts.now ?? Date.now;
  const users = createUserRepo(db, now);

  return {
    create(userId: number): string {
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
        hashToken(token),
        userId,
        now() + ttl,
        now(),
      );
      return token;
    },
    get(token: string): User | null {
      if (!token) return null;
      const h = hashToken(token);
      const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(h) as
        | { user_id: number; expires_at: number }
        | undefined;
      if (!row) return null;
      if (row.expires_at <= now()) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(h);
        return null;
      }
      const user = users.findById(row.user_id);
      return user && !user.disabled ? user : null;
    },
    destroy(token: string): void {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    },
    destroyAllForUser(userId: number): void {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    },
    purgeExpired(): void {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
