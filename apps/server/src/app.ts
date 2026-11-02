import { getConnInfo } from '@hono/node-server/conninfo';
import { APP_PATHS, type AppPaths } from '@harness/core/config';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { loadUser, type AppEnv } from './auth/middleware.js';
import { createLoginLimiter } from './auth/rateLimit.js';
import { createSessionStore } from './auth/sessions.js';
import type { Db } from './db/database.js';
import { createAssignmentRepo } from './repos/assignments.js';
import { createAuditRepo } from './repos/audit.js';
import { createClassRepo } from './repos/classes.js';
import { createGradeRepo } from './repos/grades.js';
import { createSubmissionRepo } from './repos/submissions.js';
import { createUserRepo } from './repos/users.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { studentRoutes } from './routes/student.js';
import { teacherRoutes } from './routes/teacher.js';
import { securityMiddleware } from './security.js';

// Mọi phụ thuộc của server gom vào một chỗ: route chỉ nhận ctx, test thay được từng phần.
export function createAppContext(db: Db, opts: { now?: () => number; paths?: AppPaths; github?: { fetch?: typeof fetch; token?: string } } = {}) {
  const now = opts.now ?? Date.now;
  return {
    db,
    now,
    paths: opts.paths ?? APP_PATHS,
    github: opts.github ?? { token: process.env.GITHUB_TOKEN || undefined },
    users: createUserRepo(db, now),
    classes: createClassRepo(db, now),
    assignments: createAssignmentRepo(db, now),
    submissions: createSubmissionRepo(db, now),
    grades: createGradeRepo(db, now),
    sessions: createSessionStore(db, { now }),
    audit: createAuditRepo(db, now),
    loginLimiter: createLoginLimiter(db, { now }),
    ipLimiter: createLoginLimiter(db, { now, maxFailures: 30 }),
    clientIp(c: Context): string {
      try {
        return getConnInfo(c).remote.address ?? 'unknown';
      } catch {
        return 'unknown';
      }
    },
  };
}

export type AppContext = ReturnType<typeof createAppContext>;

export type ServerOptions = { port: number; dev?: boolean; secureCookie?: boolean };

export function createServerApp(ctx: AppContext, opts: ServerOptions) {
  const app = new Hono<AppEnv>();
  app.use('*', ...securityMiddleware({ port: opts.port, dev: opts.dev }));
  app.use('/api/*', loadUser(ctx.sessions));

  app.route('/api/auth', authRoutes(ctx, { secureCookie: opts.secureCookie ?? false }));

  app.route('/api/student', studentRoutes(ctx));

  app.route('/api/teacher', teacherRoutes(ctx));
  app.route('/api/admin', adminRoutes(ctx));

  app.all('/api/*', (c) => c.json({ error: 'Không tìm thấy' }, 404));
  app.onError((err, c) => {
    console.error('[server] lỗi khi xử lý request:', err);
    return c.json({ error: 'Lỗi nội bộ' }, 500);
  });
  return app;
}
