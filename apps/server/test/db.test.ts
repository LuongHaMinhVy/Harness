import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { openDatabase } from '../src/db/database.js';

test('migration tạo đủ bảng, bật foreign key, mở lại không chạy migration lần hai', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'db-')), 'app.db');
  const db = openDatabase(file);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map(
    (r) => r.name,
  );
  for (const t of ['users', 'sessions', 'login_attempts', 'classes', 'class_members', 'assignments', 'submissions', 'gradings', 'grades', 'audit_log', 'schema_migrations']) {
    expect(tables).toContain(t);
  }
  expect((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(1);
  db.close();
  const again = openDatabase(file);
  expect((again.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n).toBe(3);
  again.close();
});
