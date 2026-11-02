import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Role } from '@harness/shared/api';
import { createAppContext, createServerApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { openDatabase } from '../src/db/database.js';

// Database SQLite trong bộ nhớ, đã chạy migration — mỗi test một database riêng.
export const memoryDb = () => openDatabase(':memory:');

export const BASE = 'http://127.0.0.1:3000';

export type Client = {
  cookie: string;
  get(path: string): Promise<Response>;
  post(path: string, body?: unknown): Promise<Response>;
  put(path: string, body?: unknown): Promise<Response>;
  del(path: string): Promise<Response>;
  json<T = any>(res: Promise<Response>): Promise<T>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

// Server thử nghiệm có sẵn: admin, 2 giảng viên (gv, gv2), 2 học viên (nam, lan) — đã đăng nhập sẵn.
export async function createTestServer(extra: Partial<Parameters<typeof createAppContext>[1]> = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'srv-'));
  const ctx = createAppContext(memoryDb(), {
    paths: {
      dataDir,
      gradesFile: join(dataDir, 'grades.json'),
      evalGradesFile: join(dataDir, 'grades-eval.json'),
      cacheFile: join(dataDir, 'cache.json'),
      logDir: join(dataDir, 'logs'),
      goldenFile: join(dataDir, 'golden.json'),
    },
    ...extra,
  });
  const app = createServerApp(ctx, { port: 3000 });
  const hash = await hashPassword('mat-khau-123');
  const make = (username: string, role: Role) => ctx.users.create({ username, fullName: username.toUpperCase(), role, passwordHash: hash });
  const users = { admin: make('admin', 'admin'), gv: make('gv', 'teacher'), gv2: make('gv2', 'teacher'), nam: make('nam', 'student'), lan: make('lan', 'student') };

  const request = async (cookie: string, method: string, path: string, body?: unknown): Promise<Response> =>
    app.request(`${BASE}${path}`, {
      method,
      headers: { Cookie: cookie, ...(method === 'GET' ? {} : { Origin: BASE, 'Content-Type': 'application/json' }) },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });

  async function login(username: string, password = 'mat-khau-123'): Promise<Client> {
    const res = await request('', 'POST', '/api/auth/login', { username, password });
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
    return clientFor(cookie);
  }
  function clientFor(cookie: string): Client {
    return {
      cookie,
      get: (p) => request(cookie, 'GET', p),
      post: (p, b) => request(cookie, 'POST', p, b),
      put: (p, b) => request(cookie, 'PUT', p, b),
      del: (p) => request(cookie, 'DELETE', p),
      json: async (r) => (await r).json(),
    };
  }
  const as = {
    admin: await login('admin'),
    gv: await login('gv'),
    gv2: await login('gv2'),
    nam: await login('nam'),
    lan: await login('lan'),
    guest: clientFor(''),
  };
  return { ctx, app, users, as, login, dataDir };
}
