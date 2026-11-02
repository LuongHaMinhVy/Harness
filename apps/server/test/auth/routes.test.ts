import { expect, test } from 'vitest';
import { hashPassword } from '../../src/auth/password.js';
import { createAppContext, createServerApp } from '../../src/app.js';
import { memoryDb } from '../helpers.js';

const BASE = 'http://127.0.0.1:3000';
const JSON_HEADERS = { Origin: BASE, 'Content-Type': 'application/json' };

async function setup() {
  const ctx = createAppContext(memoryDb());
  const app = createServerApp(ctx, { port: 3000 });
  const hash = await hashPassword('mat-khau-nam');
  const nam = ctx.users.create({ username: 'nam', fullName: 'Nguyễn Nam', role: 'student', passwordHash: hash });
  const post = (path: string, body: unknown, cookie?: string) =>
    app.request(`${BASE}${path}`, { method: 'POST', headers: { ...JSON_HEADERS, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const get = (path: string, cookie?: string) => app.request(`${BASE}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
  const login = async (username = 'nam', password = 'mat-khau-nam') => {
    const res = await post('/api/auth/login', { username, password });
    return { res, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] };
  };
  return { ctx, app, post, get, login, nam };
}

test('đăng nhập đúng → cookie HttpOnly, SameSite=Strict, Path=/; /me trả người dùng không kèm hash', async () => {
  const { login, get } = await setup();
  const { res, cookie } = await login();
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('set-cookie')!;
  expect(setCookie).toMatch(/^sid=/);
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/SameSite=Strict/i);
  expect(setCookie).toMatch(/Path=\//);
  const me = await (await get('/api/auth/me', cookie)).json();
  expect(me.user).toMatchObject({ username: 'nam', role: 'student' });
  expect(JSON.stringify(me)).not.toMatch(/scrypt|passwordHash/);
});

test('sai mật khẩu và sai tên đăng nhập → cùng 401 với cùng thông báo', async () => {
  const { login } = await setup();
  const wrongPass = await login('nam', 'sai-mat-khau');
  const wrongUser = await login('khong-co', 'sai-mat-khau');
  expect(wrongPass.res.status).toBe(401);
  expect(wrongUser.res.status).toBe(401);
  expect(await wrongPass.res.json()).toEqual(await wrongUser.res.json());
});

test('sai 5 lần → 429 kể cả khi nhập đúng; ghi nhật ký đăng nhập thất bại', async () => {
  const { login, ctx } = await setup();
  for (let i = 0; i < 5; i++) await login('nam', 'sai-mat-khau');
  expect((await login('nam', 'mat-khau-nam')).res.status).toBe(429);
  expect(ctx.audit.list().filter((a) => a.action === 'login_failed')).toHaveLength(5);
});

test('tài khoản bị khoá không đăng nhập được', async () => {
  const { login, ctx, nam } = await setup();
  ctx.users.setDisabled(nam.id, true);
  expect((await login()).res.status).toBe(401);
});

test('/me không có cookie hoặc cookie giả → 401', async () => {
  const { get } = await setup();
  expect((await get('/api/auth/me')).status).toBe(401);
  expect((await get('/api/auth/me', 'sid=gia-mao')).status).toBe(401);
});

test('đăng xuất → phiên cũ không dùng được nữa', async () => {
  const { login, post, get } = await setup();
  const { cookie } = await login();
  expect((await post('/api/auth/logout', {}, cookie)).status).toBe(200);
  expect((await get('/api/auth/me', cookie)).status).toBe(401);
});

test('đổi mật khẩu: sai mật khẩu cũ → 400; đúng → huỷ mọi phiên cũ, cấp phiên mới', async () => {
  const { login, post, get } = await setup();
  const a = await login();
  const b = await login();
  expect((await post('/api/auth/change-password', { currentPassword: 'sai', newPassword: 'mat-khau-moi-1' }, a.cookie)).status).toBe(400);
  expect((await post('/api/auth/change-password', { currentPassword: 'mat-khau-nam', newPassword: 'ngan' }, a.cookie)).status).toBe(400);
  const res = await post('/api/auth/change-password', { currentPassword: 'mat-khau-nam', newPassword: 'mat-khau-moi-1' }, a.cookie);
  expect(res.status).toBe(200);
  const fresh = (res.headers.get('set-cookie') ?? '').split(';')[0];
  expect((await get('/api/auth/me', a.cookie)).status).toBe(401);
  expect((await get('/api/auth/me', b.cookie)).status).toBe(401);
  expect((await get('/api/auth/me', fresh)).status).toBe(200);
  expect((await login('nam', 'mat-khau-moi-1')).res.status).toBe(200);
});

test('bắt đổi mật khẩu lần đầu: route khác → 403 must_change_password; đổi xong thì hết', async () => {
  const { ctx, app, login, post } = await setup();
  ctx.users.create({ username: 'lan', fullName: 'Lan', role: 'student', passwordHash: await hashPassword('tam-thoi-123'), mustChangePassword: true });
  const { cookie } = await login('lan', 'tam-thoi-123');
  const blocked = await app.request(`${BASE}/api/student/assignments`, { headers: { Cookie: cookie } });
  expect(blocked.status).toBe(403);
  expect((await blocked.json()).error).toBe('must_change_password');
  const changed = await post('/api/auth/change-password', { currentPassword: 'tam-thoi-123', newPassword: 'mat-khau-that-1' }, cookie);
  const fresh = (changed.headers.get('set-cookie') ?? '').split(';')[0];
  expect((await app.request(`${BASE}/api/student/assignments`, { headers: { Cookie: fresh } })).status).toBe(200);
});

test('sai vai trò → 403; chưa đăng nhập → 401', async () => {
  const { app, login } = await setup();
  const { cookie } = await login();
  expect((await app.request(`${BASE}/api/teacher/classes`, { headers: { Cookie: cookie } })).status).toBe(403);
  expect((await app.request(`${BASE}/api/teacher/classes`)).status).toBe(401);
});
