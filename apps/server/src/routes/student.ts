import { GithubSubmitBody, type Assignment, type FileContent, type StudentAssignment, type StudentAssignmentDetail, type User } from '@harness/shared/api';
import { Hono } from 'hono';
import type { AppContext } from '../app.js';
import { requireAuth, requireRole, type AppEnv } from '../auth/middleware.js';
import { collectFiles, stripCommonRoot, UploadError, type UploadedFile } from '../uploads/collect.js';
import { fetchGithubSubmission } from '../uploads/github.js';
import { readSubmissionFile, saveSubmissionFiles, submissionDir } from '../uploads/store.js';
import { idParam, parseJson } from './parse.js';

const NOT_FOUND = { error: 'Không tìm thấy' } as const;

// API học viên: chỉ thấy đề được giao cho lớp mình, chỉ thấy bài nộp và điểm đã duyệt của chính mình.
export function studentRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth(), requireRole('student'));

  const withStatus = (a: ReturnType<typeof ctx.assignments.listForStudent>[number], studentId: number): StudentAssignment => ({
    ...a,
    latest: ctx.submissions.latest(a.id, studentId),
    grade: ctx.grades.latestForStudent(a.id, studentId),
  });

  app.get('/assignments', (c) => {
    const user = c.get('user')!;
    return c.json(ctx.assignments.listForStudent(user.id).map((a) => withStatus(a, user.id)));
  });

  app.get('/assignments/:id', (c) => {
    const user = c.get('user')!;
    const id = idParam(c);
    const a = id && ctx.assignments.getForStudent(id, user.id);
    if (!a) return c.json(NOT_FOUND, 404);
    const detail: StudentAssignmentDetail = { ...withStatus(a, user.id), submissions: ctx.submissions.listForStudent(a.id, user.id) };
    return c.json(detail);
  });

  // File chính phải có trong bài nộp; nếu mọi file nằm trong một thư mục gốc chung (nộp cả thư mục) thì bỏ thư mục đó.
  const arrange = (files: UploadedFile[], a: Assignment): UploadedFile[] => {
    if (files.some((f) => f.path === a.entryFile)) return files;
    const stripped = stripCommonRoot(files);
    if (stripped.some((f) => f.path === a.entryFile)) return stripped;
    throw new UploadError(`Bài nộp thiếu file chính "${a.entryFile}"`);
  };

  const save = (user: User, a: Assignment, files: UploadedFile[], origin?: { source: 'github'; url: string; commit: string }) => {
    const version = ctx.submissions.nextVersion(a.id, user.id);
    const saved = saveSubmissionFiles(submissionDir(ctx.webDir, a.slug, user.username, version), files);
    const sub = ctx.submissions.create(a.id, user.id, version, saved, origin);
    ctx.audit.log(user.id, 'submitted', a.slug, { submissionId: sub.id, version, files: saved.length, source: sub.source, commit: sub.commit });
    return sub;
  };

  const openFor = (c: { get: (k: 'user') => User | null }, id: number | null) => {
    const user = c.get('user')!;
    const a = id ? ctx.assignments.getForStudent(id, user.id) : null;
    return { user, a };
  };

  app.post('/assignments/:id/submissions/github', async (c) => {
    const { user, a } = openFor(c, idParam(c));
    if (!a) return c.json(NOT_FOUND, 404);
    if (a.dueAt !== null && ctx.now() > a.dueAt) return c.json({ error: 'Đã quá hạn nộp bài' }, 403);
    const body = await parseJson(c, GithubSubmitBody);
    if (body instanceof Response) return body;
    try {
      const gh = await fetchGithubSubmission(body.url, ctx.github);
      return c.json(save(user, a, arrange(gh.files, a), { source: 'github', url: gh.url, commit: gh.commit }), 201);
    } catch (err) {
      if (err instanceof UploadError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  app.post('/assignments/:id/submissions', async (c) => {
    const { user, a } = openFor(c, idParam(c));
    if (!a) return c.json(NOT_FOUND, 404);
    if (a.dueAt !== null && ctx.now() > a.dueAt) return c.json({ error: 'Đã quá hạn nộp bài' }, 403);

    let body: Record<string, unknown>;
    try {
      body = await c.req.parseBody({ all: true });
    } catch {
      return c.json({ error: 'Không đọc được dữ liệu nộp bài' }, 400);
    }
    const raw = body.files;
    const inputs = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).filter((f): f is File => f instanceof File);
    try {
      return c.json(save(user, a, arrange(await collectFiles(inputs), a)), 201);
    } catch (err) {
      if (err instanceof UploadError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  // Xem nội dung file đã nộp: trả JSON (giao diện hiển thị dạng chữ), không bao giờ phục vụ file như trang web.
  app.get('/submissions/:id/file', (c) => {
    const user = c.get('user')!;
    const id = idParam(c);
    const sub = id && ctx.submissions.getForStudent(id, user.id);
    const a = sub && ctx.assignments.get(sub.assignmentId);
    if (!sub || !a) return c.json(NOT_FOUND, 404);
    const path = c.req.query('path') ?? '';
    const content = readSubmissionFile(submissionDir(ctx.webDir, a.slug, user.username, sub.version), path);
    if (content === null) return c.json(NOT_FOUND, 404);
    const file: FileContent = { path, content };
    return c.json(file);
  });

  return app;
}
