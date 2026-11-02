import { GradeAllBody, GradeApproveBody, type FileContent, type StudentRef, type SubmissionRow, type TeacherSubmissionDetail, type User } from '@harness/shared/api';
import { Hono } from 'hono';
import type { AppContext } from '../app.js';
import { requireAuth, requireRole, type AppEnv } from '../auth/middleware.js';
import { readSubmissionFile, submissionDir } from '../uploads/store.js';
import { idParam, parseJson } from './parse.js';
import { sseStream } from './sse.js';

const NOT_FOUND = { error: 'Không tìm thấy' } as const;
const ref = (u: User): StudentRef => ({ id: u.id, username: u.username, fullName: u.fullName });

// Bài nộp và chấm bài cho giảng viên/admin. Mọi bài nộp đều kiểm tra qua đề → lớp → giảng viên phụ trách;
// không thuộc mình → 404.
export function gradingRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth(), requireRole('teacher', 'admin'));

  const access = (id: number | null, user: User) => {
    const sub = id ? ctx.submissions.get(id) : null;
    const a = sub ? ctx.assignments.getForTeacher(sub.assignmentId, user) : null;
    const student = sub ? ctx.users.findById(sub.studentId) : null;
    return sub && a && student ? { sub, a, student } : null;
  };

  app.get('/assignments/:id/submissions', (c) => {
    const id = idParam(c);
    const a = id && ctx.assignments.getForTeacher(id, c.get('user')!);
    if (!a) return c.json(NOT_FOUND, 404);
    const rows: SubmissionRow[] = ctx.classes.members(a.classId).map((student) => {
      const submission = ctx.submissions.latest(a.id, student.id);
      return {
        student: ref(student),
        submission,
        grading: submission ? ctx.gradings.latestForSubmission(submission.id) : null,
        grade: submission ? ctx.grades.forSubmission(submission.id) : null,
      };
    });
    return c.json(rows);
  });

  app.post('/assignments/:id/grade-all', async (c) => {
    const user = c.get('user')!;
    const id = idParam(c);
    const a = id && ctx.assignments.getForTeacher(id, user);
    if (!a) return c.json(NOT_FOUND, 404);
    const body = await parseJson(c, GradeAllBody);
    if (body instanceof Response) return body;
    let queued = 0;
    for (const sub of ctx.submissions.latestForAssignment(a.id)) {
      if (!body.regrade && ctx.grades.forSubmission(sub.id)) continue;
      if (ctx.grading.request(sub.id, user.id)) queued++;
    }
    ctx.audit.log(user.id, 'grade_all', a.slug, { queued, regrade: !!body.regrade });
    return c.json({ queued }, 202);
  });

  app.get('/submissions/:id', (c) => {
    const found = access(idParam(c), c.get('user')!);
    if (!found) return c.json(NOT_FOUND, 404);
    const { sub, a, student } = found;
    const detail: TeacherSubmissionDetail = {
      assignment: a,
      student: ref(student),
      submission: sub,
      grading: ctx.gradings.latestForSubmission(sub.id, true),
      grade: ctx.grades.forSubmission(sub.id),
      history: ctx.submissions.listForStudent(a.id, student.id),
    };
    return c.json(detail);
  });

  app.get('/submissions/:id/file', (c) => {
    const found = access(idParam(c), c.get('user')!);
    if (!found) return c.json(NOT_FOUND, 404);
    const { sub, a, student } = found;
    const path = c.req.query('path') ?? '';
    const content = readSubmissionFile(submissionDir(ctx.webDir, a.slug, student.username, sub.version), path);
    if (content === null) return c.json(NOT_FOUND, 404);
    const file: FileContent = { path, content };
    return c.json(file);
  });

  app.post('/submissions/:id/grade', (c) => {
    const user = c.get('user')!;
    const found = access(idParam(c), user);
    if (!found) return c.json(NOT_FOUND, 404);
    const g = ctx.grading.request(found.sub.id, user.id);
    if (!g) return c.json({ error: 'Bài này đang được chấm' }, 409);
    ctx.audit.log(user.id, 'grade_requested', found.student.username, { submissionId: found.sub.id, gradingId: g.id });
    return c.json(g, 202);
  });

  // Duyệt điểm: điểm chính thức do giảng viên quyết; ghi "đã sửa" nếu khác điểm/nhận xét AI đề xuất.
  app.post('/submissions/:id/approve', async (c) => {
    const user = c.get('user')!;
    const found = access(idParam(c), user);
    if (!found) return c.json(NOT_FOUND, 404);
    const body = await parseJson(c, GradeApproveBody);
    if (body instanceof Response) return body;
    const g = ctx.gradings.latestForSubmission(found.sub.id);
    const fromAi = g?.status === 'done' ? g : null;
    const edited = !fromAi || fromAi.aiScore !== body.score || (fromAi.aiComments ?? '') !== body.comments;
    ctx.grades.approve(found.sub.id, { score: body.score, comments: body.comments, gradingId: fromAi?.id ?? null, edited, approvedBy: user.id });
    ctx.audit.log(user.id, 'grade_approved', found.student.username, {
      submissionId: found.sub.id,
      assignment: found.a.slug,
      score: body.score,
      aiScore: fromAi?.aiScore ?? null,
      edited,
    });
    return c.json(ctx.grades.forSubmission(found.sub.id));
  });

  // Trạng thái chấm theo thời gian thực — chỉ sự kiện của đề mà người này được xem.
  app.get('/events', (c) => {
    const user = c.get('user')!;
    return sseStream(c, {
      subscribe: (send) =>
        ctx.gradingEvents.subscribe((e) => {
          if (ctx.assignments.getForTeacher(e.assignmentId, user)) send(e);
        }),
    });
  });

  return app;
}
