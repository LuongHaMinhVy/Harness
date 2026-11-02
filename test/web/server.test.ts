import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createApp } from '../../src/web/server.js';
import { createWebSession } from '../../src/web/webSession.js';
import { scriptedModel, type ScriptStep } from '../helpers/mockModel.js';

const BASE = 'http://127.0.0.1:3000';
const ORIGIN = { Origin: BASE, 'Content-Type': 'application/json' };

function setup(script: ScriptStep[] = [{ text: 'chào' }]) {
  const dir = mkdtempSync(join(tmpdir(), 'srv-'));
  const goldenFile = join(dir, 'golden.json');
  writeFileSync(goldenFile, '{}');
  const session = createWebSession({
    model: scriptedModel(script),
    modelName: 'mock',
    dataDir: 'data',
    gradesFile: join(dir, 'grades.json'),
    evalGradesFile: join(dir, 'grades-eval.json'),
    cacheFile: join(dir, 'cache.json'),
    logDir: join(dir, 'logs'),
    goldenFile,
    maxSteps: 6,
    evalPauseMs: 0,
  });
  const app = createApp({ session, port: 3000 });
  const post = (path: string, body: unknown, headers: Record<string, string> = ORIGIN) =>
    app.request(`${BASE}${path}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { app, session, post };
}

// --- bảo mật ---

test('Host lạ (DNS rebinding) → 403', async () => {
  const { app } = setup();
  expect((await app.request('http://evil.com:3000/api/state')).status).toBe(403);
});

test('localhost:3000 và 127.0.0.1:3000 đều được phép', async () => {
  const { app } = setup();
  expect((await app.request('http://localhost:3000/api/state')).status).toBe(200);
  expect((await app.request(`${BASE}/api/state`)).status).toBe(200);
});

test('POST thiếu Origin hoặc Origin lạ → 403 (CSRF)', async () => {
  const { post } = setup();
  expect((await post('/api/ask', { question: 'hi' }, { 'Content-Type': 'application/json' })).status).toBe(403);
  expect((await post('/api/ask', { question: 'hi' }, { Origin: 'https://evil.com', 'Content-Type': 'application/json' })).status).toBe(403);
});

test('POST không phải application/json → 415', async () => {
  const { post } = setup();
  expect((await post('/api/ask', 'question=hi', { Origin: BASE, 'Content-Type': 'text/plain' })).status).toBe(415);
});

test('Origin cổng Vite 5173 chỉ được nhận khi bật dev', async () => {
  const { session } = setup();
  const vite = { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' };
  const prod = createApp({ session, port: 3000 });
  const dev = createApp({ session, port: 3000, dev: true });
  const req = { method: 'POST', headers: vite, body: JSON.stringify({ maxSteps: 3 }) };
  expect((await prod.request(`${BASE}/api/settings`, req)).status).toBe(403);
  expect((await dev.request(`${BASE}/api/settings`, req)).status).toBe(200);
});

test('có header CSP và các header bảo mật', async () => {
  const { app } = setup();
  const res = await app.request(`${BASE}/api/state`);
  expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
});

test('body quá lớn → 413', async () => {
  const { post } = setup();
  expect((await post('/api/ask', { question: 'x'.repeat(40_000) })).status).toBe(413);
});

// --- route ---

test('ask hợp lệ → 202; rỗng hoặc dài quá → 400; JSON hỏng → 400', async () => {
  const { post, session } = setup();
  expect((await post('/api/ask', { question: '   ' })).status).toBe(400);
  expect((await post('/api/ask', { question: 'x'.repeat(2001) })).status).toBe(400);
  expect((await post('/api/ask', '{hỏng')).status).toBe(400);
  expect((await post('/api/ask', { question: 'Chấm bài của Nam' })).status).toBe(202);
  await session.idle();
  expect(session.snapshot().turns[0].answer).toBe('chào');
});

test('ask khi đang bận → 409; reset khi đang bận → 409', async () => {
  let release!: () => void;
  const { post, session } = setup([{ wait: new Promise<void>((r) => (release = r)), text: 'xong' }]);
  expect((await post('/api/ask', { question: 'một' })).status).toBe(202);
  expect((await post('/api/ask', { question: 'hai' })).status).toBe(409);
  expect((await post('/api/reset', {})).status).toBe(409);
  expect((await post('/api/eval', {})).status).toBe(409);
  release();
  await session.idle();
  expect((await post('/api/reset', {})).status).toBe(200);
});

test('approve: id không phải UUID → 400; UUID không đang chờ → 404', async () => {
  const { post } = setup();
  expect((await post('/api/approve', { id: 'abc', approved: true })).status).toBe(400);
  expect((await post('/api/approve', { id: crypto.randomUUID(), approved: true })).status).toBe(404);
});

test('settings: 0 hoặc 21 → 400; 3 → 200 và cập nhật state', async () => {
  const { post, app } = setup();
  expect((await post('/api/settings', { maxSteps: 0 })).status).toBe(400);
  expect((await post('/api/settings', { maxSteps: 21 })).status).toBe(400);
  expect((await post('/api/settings', { maxSteps: 3 })).status).toBe(200);
  expect((await (await app.request(`${BASE}/api/state`)).json()).maxSteps).toBe(3);
});

test('GET /api/grades trả mảng; route lạ → 404 JSON', async () => {
  const { app } = setup();
  expect(await (await app.request(`${BASE}/api/grades`)).json()).toEqual([]);
  const res = await app.request(`${BASE}/api/khong-co`);
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'Không tìm thấy' });
});

test('lỗi trả về không chứa stack trace hay đường dẫn file', async () => {
  const { post } = setup();
  const text = await (await post('/api/ask', '{hỏng')).text();
  expect(text).not.toMatch(/\bat\s.+\(|\.ts:\d+|node_modules/);
});
