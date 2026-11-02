import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createTestServer } from './helpers.js';

const TESTS_JS = "module.exports = [{ name: 'chạy', run: () => {} }];";
const assignmentBody = (classId: number, over: Record<string, unknown> = {}) => ({
  title: 'Tính tổng mảng',
  description: 'Viết hàm sumArray',
  rubric: 'Đúng hết test: 10 điểm',
  entryFile: 'index.js',
  classId,
  dueAt: null,
  tests: TESTS_JS,
  ...over,
});

async function withClass() {
  const s = await createTestServer();
  const cls = await s.as.gv.json(s.as.gv.post('/api/teacher/classes', { name: 'Lớp JS 01' }));
  return { ...s, cls };
}

// --- lớp ---

test('giảng viên tạo lớp, chỉ thấy lớp của mình; giảng viên khác nhận 404; admin thấy tất cả', async () => {
  const { as, cls } = await withClass();
  expect(cls).toMatchObject({ name: 'Lớp JS 01', studentCount: 0 });
  expect(await as.gv.json(as.gv.get('/api/teacher/classes'))).toHaveLength(1);
  expect(await as.gv2.json(as.gv2.get('/api/teacher/classes'))).toHaveLength(0);
  expect((await as.gv2.get(`/api/teacher/classes/${cls.id}`)).status).toBe(404);
  expect(await as.admin.json(as.admin.get('/api/teacher/classes'))).toHaveLength(1);
  expect((await as.admin.get(`/api/teacher/classes/${cls.id}`)).status).toBe(200);
});

test('học viên và khách không vào được API giảng viên', async () => {
  const { as } = await withClass();
  expect((await as.nam.get('/api/teacher/classes')).status).toBe(403);
  expect((await as.guest.get('/api/teacher/classes')).status).toBe(401);
});

test('tên lớp rỗng → 400 với thông báo tiếng Việt', async () => {
  const { as } = await withClass();
  const res = await as.gv.post('/api/teacher/classes', { name: '  ' });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/[ạảãáàâăêôơưđ]/i);
});

// --- học viên ---

test('thêm học viên: tạo tài khoản mới kèm mật khẩu tạm (bắt đổi lần đầu), thêm học viên có sẵn, từ chối tài khoản giảng viên', async () => {
  const { as, cls, login } = await withClass();
  const res = await as.gv.json(
    as.gv.post(`/api/teacher/classes/${cls.id}/students`, {
      students: [
        { username: 'minh', fullName: 'Lê Minh' },
        { username: 'nam', fullName: 'NAM' },
        { username: 'gv2', fullName: 'Giảng viên 2' },
      ],
    }),
  );
  expect(res.map((r: { status: string }) => r.status)).toEqual(['created', 'added', 'error']);
  expect(res[0].tempPassword).toMatch(/^[A-Za-z0-9]{12}$/);
  expect(res[1].tempPassword).toBeUndefined();
  const detail = await as.gv.json(as.gv.get(`/api/teacher/classes/${cls.id}`));
  expect(detail.students.map((u: { username: string }) => u.username).sort()).toEqual(['minh', 'nam']);
  const minh = await login('minh', res[0].tempPassword);
  expect((await minh.json(minh.get('/api/auth/me'))).user.mustChangePassword).toBe(true);
});

test('thêm học viên vào lớp của giảng viên khác → 404', async () => {
  const { as, cls } = await withClass();
  expect((await as.gv2.post(`/api/teacher/classes/${cls.id}/students`, { students: [{ username: 'x1', fullName: 'X' }] })).status).toBe(404);
});

test('đặt lại mật khẩu học viên: mật khẩu tạm mới, phiên cũ bị huỷ', async () => {
  const { as, cls, users } = await withClass();
  await as.gv.post(`/api/teacher/classes/${cls.id}/students`, { students: [{ username: 'nam', fullName: 'NAM' }] });
  const r = await as.gv.json(as.gv.post(`/api/teacher/classes/${cls.id}/students/${users.nam.id}/reset-password`));
  expect(r.tempPassword).toMatch(/^[A-Za-z0-9]{12}$/);
  expect((await as.nam.get('/api/auth/me')).status).toBe(401);
});

test('đặt lại mật khẩu học viên không thuộc lớp → 404', async () => {
  const { as, cls, users } = await withClass();
  expect((await as.gv.post(`/api/teacher/classes/${cls.id}/students/${users.lan.id}/reset-password`)).status).toBe(404);
});

test('xoá học viên khỏi lớp', async () => {
  const { as, cls, users } = await withClass();
  await as.gv.post(`/api/teacher/classes/${cls.id}/students`, { students: [{ username: 'nam', fullName: 'NAM' }] });
  expect((await as.gv.del(`/api/teacher/classes/${cls.id}/students/${users.nam.id}`)).status).toBe(200);
  expect((await as.gv.json(as.gv.get(`/api/teacher/classes/${cls.id}`))).students).toEqual([]);
});

// --- đề bài ---

test('tạo đề: ghi README/rubric/tests.js, slug không dấu và không trùng', async () => {
  const { as, cls, dataDir } = await withClass();
  const a = await as.gv.json(as.gv.post('/api/teacher/assignments', assignmentBody(cls.id)));
  const b = await as.gv.json(as.gv.post('/api/teacher/assignments', assignmentBody(cls.id)));
  expect(a.slug).toBe('tinh-tong-mang');
  expect(b.slug).toBe('tinh-tong-mang-2');
  const dir = join(dataDir, 'assignments', a.slug);
  expect(readFileSync(join(dir, 'tests.js'), 'utf8')).toBe(TESTS_JS);
  expect(readFileSync(join(dir, 'README.md'), 'utf8')).toContain('sumArray');
  expect(existsSync(join(dir, 'rubric.md'))).toBe(true);
});

test('tạo đề: file chính có ".." hoặc đuôi lạ → 400; lớp của giảng viên khác → 404', async () => {
  const { as, cls } = await withClass();
  expect((await as.gv.post('/api/teacher/assignments', assignmentBody(cls.id, { entryFile: '../x.js' }))).status).toBe(400);
  expect((await as.gv.post('/api/teacher/assignments', assignmentBody(cls.id, { entryFile: 'index.py' }))).status).toBe(400);
  expect((await as.gv2.post('/api/teacher/assignments', assignmentBody(cls.id))).status).toBe(404);
});

test('xem/sửa đề của giảng viên khác → 404; sửa đề của mình cập nhật file', async () => {
  const { as, cls, dataDir } = await withClass();
  const a = await as.gv.json(as.gv.post('/api/teacher/assignments', assignmentBody(cls.id)));
  expect((await as.gv2.get(`/api/teacher/assignments/${a.id}`)).status).toBe(404);
  expect((await as.gv2.put(`/api/teacher/assignments/${a.id}`, assignmentBody(cls.id))).status).toBe(404);
  const updated = await as.gv.json(as.gv.put(`/api/teacher/assignments/${a.id}`, assignmentBody(cls.id, { rubric: 'Rubric mới' })));
  expect(updated.slug).toBe(a.slug);
  expect(readFileSync(join(dataDir, 'assignments', a.slug, 'rubric.md'), 'utf8')).toBe('Rubric mới');
  const detail = await as.gv.json(as.gv.get(`/api/teacher/assignments/${a.id}`));
  expect(detail.tests).toBe(TESTS_JS);
  expect(await as.gv2.json(as.gv2.get('/api/teacher/assignments'))).toEqual([]);
});
