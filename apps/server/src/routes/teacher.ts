import { AddStudentsBody, AssignmentBody, ClassBody, type AddStudentResult, type AssignmentDetail } from '@harness/shared/api';
import { Hono } from 'hono';
import type { AppContext } from '../app.js';
import { readAssignmentTests, uniqueSlug, writeAssignmentFiles } from '../assignments/files.js';
import { requireAuth, requireRole, type AppEnv } from '../auth/middleware.js';
import { generateTempPassword, hashPassword } from '../auth/password.js';
import { idParam, parseJson } from './parse.js';

const NOT_FOUND = { error: 'Không tìm thấy' } as const;

// API của giảng viên (admin dùng được với quyền xem mọi lớp). Mọi truy vấn đều lọc theo người đang đăng nhập:
// lớp/đề không thuộc mình → 404, không lộ là có tồn tại.
export function teacherRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth(), requireRole('teacher', 'admin'));

  // --- lớp ---

  app.get('/classes', (c) => c.json(ctx.classes.listFor(c.get('user')!)));

  app.post('/classes', async (c) => {
    const body = await parseJson(c, ClassBody);
    if (body instanceof Response) return body;
    const user = c.get('user')!;
    const cls = ctx.classes.create(body.name, user.id);
    ctx.audit.log(user.id, 'class_created', cls.name, { classId: cls.id });
    return c.json(cls, 201);
  });

  app.get('/classes/:id', (c) => {
    const id = idParam(c);
    const cls = id && ctx.classes.getFor(id, c.get('user')!);
    if (!cls) return c.json(NOT_FOUND, 404);
    return c.json({ ...cls, students: ctx.classes.members(cls.id) });
  });

  // Thêm học viên: tạo tài khoản mới (mật khẩu tạm, bắt đổi lần đầu) hoặc thêm học viên đã có.
  // Mật khẩu tạm chỉ trả về đúng một lần trong response này, không ghi vào nhật ký.
  app.post('/classes/:id/students', async (c) => {
    const id = idParam(c);
    const user = c.get('user')!;
    const cls = id && ctx.classes.getFor(id, user);
    if (!cls) return c.json(NOT_FOUND, 404);
    const body = await parseJson(c, AddStudentsBody);
    if (body instanceof Response) return body;

    const results: AddStudentResult[] = [];
    for (const s of body.students) {
      const existing = ctx.users.findCredentials(s.username);
      if (existing && existing.role !== 'student') {
        results.push({ ...s, status: 'error', message: 'Tên đăng nhập đã dùng cho tài khoản không phải học viên' });
      } else if (existing) {
        const already = ctx.classes.isMember(cls.id, existing.id);
        ctx.classes.addMember(cls.id, existing.id);
        results.push({ username: existing.username, fullName: existing.fullName, status: already ? 'exists' : 'added' });
      } else {
        const tempPassword = generateTempPassword();
        const created = ctx.users.create({ ...s, role: 'student', passwordHash: await hashPassword(tempPassword), mustChangePassword: true });
        ctx.classes.addMember(cls.id, created.id);
        results.push({ ...s, status: 'created', tempPassword });
      }
    }
    ctx.audit.log(user.id, 'students_added', cls.name, {
      classId: cls.id,
      usernames: results.filter((r) => r.status !== 'error').map((r) => r.username),
    });
    return c.json(results);
  });

  app.post('/classes/:id/students/:studentId/reset-password', async (c) => {
    const id = idParam(c);
    const studentId = idParam(c, 'studentId');
    const user = c.get('user')!;
    const cls = id && ctx.classes.getFor(id, user);
    if (!cls || !studentId || !ctx.classes.isMember(cls.id, studentId)) return c.json(NOT_FOUND, 404);
    const tempPassword = generateTempPassword();
    ctx.users.setPassword(studentId, await hashPassword(tempPassword), true);
    ctx.sessions.destroyAllForUser(studentId);
    ctx.audit.log(user.id, 'password_reset', ctx.users.findById(studentId)?.username, { classId: cls.id });
    return c.json({ tempPassword });
  });

  app.delete('/classes/:id/students/:studentId', (c) => {
    const id = idParam(c);
    const studentId = idParam(c, 'studentId');
    const user = c.get('user')!;
    const cls = id && ctx.classes.getFor(id, user);
    if (!cls || !studentId || !ctx.classes.removeMember(cls.id, studentId)) return c.json(NOT_FOUND, 404);
    ctx.audit.log(user.id, 'student_removed', ctx.users.findById(studentId)?.username, { classId: cls.id });
    return c.json({ ok: true });
  });

  // --- đề bài ---

  app.get('/assignments', (c) => c.json(ctx.assignments.listForTeacher(c.get('user')!)));

  app.post('/assignments', async (c) => {
    const user = c.get('user')!;
    const body = await parseJson(c, AssignmentBody);
    if (body instanceof Response) return body;
    if (!ctx.classes.getFor(body.classId, user)) return c.json(NOT_FOUND, 404);
    const { tests, ...input } = body;
    const slug = uniqueSlug(body.title, ctx.assignments.slugTaken, ctx.webDir);
    writeAssignmentFiles(ctx.webDir, slug, body);
    const a = ctx.assignments.create(slug, input, user.id);
    ctx.audit.log(user.id, 'assignment_created', a.slug, { assignmentId: a.id, tests: tests.length });
    return c.json(a, 201);
  });

  app.get('/assignments/:id', (c) => {
    const id = idParam(c);
    const a = id && ctx.assignments.getForTeacher(id, c.get('user')!);
    if (!a) return c.json(NOT_FOUND, 404);
    const detail: AssignmentDetail = { ...a, tests: readAssignmentTests(ctx.webDir, a.slug) };
    return c.json(detail);
  });

  app.put('/assignments/:id', async (c) => {
    const id = idParam(c);
    const user = c.get('user')!;
    const existing = id && ctx.assignments.getForTeacher(id, user);
    if (!existing) return c.json(NOT_FOUND, 404);
    const body = await parseJson(c, AssignmentBody);
    if (body instanceof Response) return body;
    if (!ctx.classes.getFor(body.classId, user)) return c.json(NOT_FOUND, 404);
    const { tests: _tests, ...input } = body;
    writeAssignmentFiles(ctx.webDir, existing.slug, body);
    const a = ctx.assignments.update(existing.id, input);
    ctx.audit.log(user.id, 'assignment_updated', a.slug, { assignmentId: a.id });
    return c.json(a);
  });

  return app;
}
