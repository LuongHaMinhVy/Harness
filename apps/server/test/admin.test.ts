import { expect, test } from 'vitest';
import { createTestServer } from './helpers.js';

test('admin tạo tài khoản giảng viên với mật khẩu tạm; giảng viên đăng nhập phải đổi mật khẩu', async () => {
  const { as, login } = await createTestServer();
  const r = await as.admin.json(as.admin.post('/api/admin/users', { username: 'gv3', fullName: 'Giảng viên 3', role: 'teacher' }));
  expect(r.user).toMatchObject({ username: 'gv3', role: 'teacher', mustChangePassword: true });
  expect(r.tempPassword).toMatch(/^[A-Za-z0-9]{12}$/);
  const gv3 = await login('gv3', r.tempPassword);
  expect((await gv3.get('/api/teacher/classes')).status).toBe(403);
});

test('admin không tạo được tài khoản học viên qua API này; trùng tên → 409', async () => {
  const { as } = await createTestServer();
  expect((await as.admin.post('/api/admin/users', { username: 'hv', fullName: 'HV', role: 'student' })).status).toBe(400);
  expect((await as.admin.post('/api/admin/users', { username: 'gv', fullName: 'Trùng', role: 'teacher' })).status).toBe(409);
});

test('giảng viên và học viên không vào được API admin', async () => {
  const { as } = await createTestServer();
  expect((await as.gv.get('/api/admin/users')).status).toBe(403);
  expect((await as.nam.get('/api/admin/audit')).status).toBe(403);
});

test('khoá tài khoản → phiên đang mở mất hiệu lực; admin không tự khoá chính mình', async () => {
  const { as, users } = await createTestServer();
  expect((await as.admin.post(`/api/admin/users/${users.gv.id}/disable`, { disabled: true })).status).toBe(200);
  expect((await as.gv.get('/api/auth/me')).status).toBe(401);
  expect((await as.admin.post(`/api/admin/users/${users.admin.id}/disable`, { disabled: true })).status).toBe(400);
});

test('nhật ký ghi lại đăng nhập và tạo tài khoản, kèm tên người thực hiện', async () => {
  const { as } = await createTestServer();
  await as.admin.post('/api/admin/users', { username: 'gv3', fullName: 'GV3', role: 'teacher' });
  const log = await as.admin.json(as.admin.get('/api/admin/audit'));
  expect(log[0]).toMatchObject({ action: 'user_created', actor: 'admin', target: 'gv3' });
  expect(log.some((e: { action: string }) => e.action === 'login')).toBe(true);
  expect(JSON.stringify(log)).not.toMatch(/tempPassword|scrypt/);
});
