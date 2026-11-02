import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export type Db = DatabaseSync;

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

// Mở database và chạy các migration chưa chạy (theo thứ tự tên file 001_, 002_…), mỗi file một transaction.
export function openDatabase(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const applied = new Set((db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name));
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const name of files) {
    if (applied.has(name)) continue;
    transaction(db, () => {
      db.exec(readFileSync(MIGRATIONS_DIR + name, 'utf8'));
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(name, Date.now());
    });
  }
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
