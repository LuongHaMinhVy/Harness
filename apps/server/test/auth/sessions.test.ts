import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { createSessionStore } from '../../src/auth/sessions.js';
import { createUserRepo } from '../../src/repos/users.js';
import { memoryDb } from '../helpers.js';

function setup() {
  const db = memoryDb();
  let now = 1_000_000;
  const users = createUserRepo(db);
  const u = users.create({ username: 'nam', fullName: 'Nguyễn Nam', role: 'student', passwordHash: 'x' });
  const store = createSessionStore(db, { ttlMs: 1000, now: () => now });
  return { db, store, u, users, tick: (ms: number) => (now += ms) };
}

test('tạo phiên → lấy lại được người dùng; DB chỉ lưu hash của token', () => {
  const { db, store, u } = setup();
  const token = store.create(u.id);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(store.get(token)?.id).toBe(u.id);
  const rows = db.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[];
  expect(rows[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'));
  expect(JSON.stringify(rows)).not.toContain(token);
});

test('phiên hết hạn → null', () => {
  const { store, u, tick } = setup();
  const token = store.create(u.id);
  tick(1001);
  expect(store.get(token)).toBeNull();
});

test('huỷ một phiên / huỷ mọi phiên của người dùng', () => {
  const { store, u } = setup();
  const a = store.create(u.id);
  const b = store.create(u.id);
  store.destroy(a);
  expect(store.get(a)).toBeNull();
  expect(store.get(b)).not.toBeNull();
  store.destroyAllForUser(u.id);
  expect(store.get(b)).toBeNull();
});

test('token lạ hoặc rỗng → null; tài khoản bị khoá → null', () => {
  const { store, u, users } = setup();
  expect(store.get('khong-co')).toBeNull();
  expect(store.get('')).toBeNull();
  const token = store.create(u.id);
  users.setDisabled(u.id, true);
  expect(store.get(token)).toBeNull();
});
