import type { Role, User } from '@harness/shared/api';
import type { Db } from '../db/database.js';

type Row = {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  password_hash: string;
  must_change_password: number;
  disabled: number;
  created_at: number;
};

const toUser = (r: Row): User => ({
  id: r.id,
  username: r.username,
  fullName: r.full_name,
  role: r.role,
  mustChangePassword: r.must_change_password === 1,
  disabled: r.disabled === 1,
  createdAt: r.created_at,
});

export type NewUser = { username: string; fullName: string; role: Role; passwordHash: string; mustChangePassword?: boolean };

export function createUserRepo(db: Db, now: () => number = Date.now) {
  const byId = db.prepare('SELECT * FROM users WHERE id = ?');
  const byName = db.prepare('SELECT * FROM users WHERE username = ?');
  return {
    create(u: NewUser): User {
      const r = db
        .prepare(
          'INSERT INTO users (username, full_name, role, password_hash, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
        )
        .get(u.username, u.fullName, u.role, u.passwordHash, u.mustChangePassword ? 1 : 0, now()) as Row;
      return toUser(r);
    },
    findById(id: number): User | null {
      const r = byId.get(id) as Row | undefined;
      return r ? toUser(r) : null;
    },
    /** Kèm hash mật khẩu — chỉ dùng cho đăng nhập. */
    findCredentials(username: string): (User & { passwordHash: string }) | null {
      const r = byName.get(username) as Row | undefined;
      return r ? { ...toUser(r), passwordHash: r.password_hash } : null;
    },
    passwordHash(id: number): string | null {
      const r = byId.get(id) as Row | undefined;
      return r?.password_hash ?? null;
    },
    exists(username: string): boolean {
      return byName.get(username) !== undefined;
    },
    setPassword(id: number, passwordHash: string, mustChangePassword = false): void {
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?').run(passwordHash, mustChangePassword ? 1 : 0, id);
    },
    setDisabled(id: number, disabled: boolean): void {
      db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, id);
    },
    list(role?: Role): User[] {
      const rows = (
        role
          ? db.prepare('SELECT * FROM users WHERE role = ? ORDER BY username').all(role)
          : db.prepare('SELECT * FROM users ORDER BY role, username').all()
      ) as Row[];
      return rows.map(toUser);
    },
    countByRole(role: Role): number {
      return (db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ?').get(role) as { n: number }).n;
    },
  };
}

export type UserRepo = ReturnType<typeof createUserRepo>;
