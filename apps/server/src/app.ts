import { join } from 'node:path';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { APP_PATHS, type AppPaths } from '@harness/core/config';
import { createTestCache } from '@harness/core/toolCache';
import type { GradingEvent } from '@harness/shared/api';
import type { LanguageModel } from 'ai';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { loadUser, type AppEnv } from './auth/middleware.js';
import { createLoginLimiter } from './auth/rateLimit.js';
import { createSessionStore } from './auth/sessions.js';
import type { Db } from './db/database.js';
import { createEventHub } from './events.js';
import { createGradingService } from './grading/service.js';
import { createAssignmentRepo } from './repos/assignments.js';
import { createAuditRepo } from './repos/audit.js';
import { createClassRepo } from './repos/classes.js';
import { createGradeRepo } from './repos/grades.js';
import { createGradingRepo } from './repos/gradings.js';
import { createSubmissionRepo } from './repos/submissions.js';
import { createUserRepo } from './repos/users.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { gradingRoutes } from './routes/grading.js';
import { harnessRoutes } from './routes/harness.js';
import { studentRoutes } from './routes/student.js';
import { teacherRoutes } from './routes/teacher.js';
import { securityMiddleware } from './security.js';
import type { WebSession } from './webSession.js';

export type ContextOptions = {
  now?: () => number;
  paths?: AppPaths;
  github?: { fetch?: typeof fetch; token?: string };
  /** Model dùng để chấm; thiếu thì bấm "Chấm" sẽ báo lỗi cấu hình. */
  model?: LanguageModel;
  modelName?: string;
  maxSteps?: number;
  /** Phiên Harness cho trang admin (hỏi tự do, log, eval). */
  harness?: WebSession;
};

const missingModel = new Proxy({} as LanguageModel & object, {
  get() {
    throw new Error('Chưa cấu hình model để chấm bài (thiếu GOOGLE_GENERATIVE_AI_API_KEY)');
  },
});

// Mọi phụ thuộc của server gom vào một chỗ: route chỉ nhận ctx, test thay được từng phần.
export function createAppContext(db: Db, opts: ContextOptions = {}) {
  const now = opts.now ?? Date.now;
  const paths = opts.paths ?? APP_PATHS;
  const webDir = paths.webDir ?? paths.dataDir;
  const users = createUserRepo(db, now);
  const assignments = createAssignmentRepo(db, now);
  const submissions = createSubmissionRepo(db, now);
  const gradings = createGradingRepo(db, now);
  const gradingEvents = createEventHub<GradingEvent>();
  gradings.failInterrupted();

  return {
    db,
    now,
    paths,
    /** Gốc chứa assignments/ và submissions/ của web lớp học. */
    webDir,
    modelName: opts.modelName ?? 'chưa cấu hình',
    harness: opts.harness,
    github: opts.github ?? { token: process.env.GITHUB_TOKEN || undefined },
    users,
    classes: createClassRepo(db, now),
    assignments,
    submissions,
    gradings,
    grades: createGradeRepo(db, now),
    sessions: createSessionStore(db, { now }),
    audit: createAuditRepo(db, now),
    loginLimiter: createLoginLimiter(db, { now }),
    ipLimiter: createLoginLimiter(db, { now, maxFailures: 30 }),
    gradingEvents,
    grading: createGradingService({
      dataDir: webDir,
      model: opts.model ?? missingModel,
      maxSteps: opts.maxSteps ?? 8,
      cache: createTestCache(paths.cacheFile),
      users,
      assignments,
      submissions,
      gradings,
      emit: gradingEvents.publish,
    }),
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

export type ServerOptions = {
  port: number;
  dev?: boolean;
  /** Tên máy/IP được phép khi mở LAN (ngoài localhost). */
  allowedHosts?: string[];
  /** Chạy HTTPS: Origin phải là https://…, cookie có cờ Secure. */
  https?: boolean;
  staticRoot?: string;
};

export function createServerApp(ctx: AppContext, opts: ServerOptions) {
  const app = new Hono<AppEnv>();
  app.use('*', ...securityMiddleware({ port: opts.port, dev: opts.dev, allowedHosts: opts.allowedHosts, https: opts.https }));
  app.use('/api/*', loadUser(ctx.sessions));

  app.route('/api/auth', authRoutes(ctx, { secureCookie: opts.https ?? false }));
  app.route('/api/student', studentRoutes(ctx));
  app.route('/api/teacher', teacherRoutes(ctx));
  app.route('/api/teacher', gradingRoutes(ctx));
  app.route('/api/admin', adminRoutes(ctx));
  if (ctx.harness) app.route('/api/admin/harness', harnessRoutes(ctx.harness));

  app.all('/api/*', (c) => c.json({ error: 'Không tìm thấy' }, 404));
  if (opts.staticRoot) {
    // Giao diện React đã build; mọi đường dẫn không phải /api trả index.html (React Router xử lý).
    app.use('*', serveStatic({ root: opts.staticRoot }));
    app.get('*', serveStatic({ path: join(opts.staticRoot, 'index.html') }));
  }
  app.onError((err, c) => {
    console.error('[server] lỗi khi xử lý request:', err);
    return c.json({ error: 'Lỗi nội bộ' }, 500);
  });
  return app;
}
