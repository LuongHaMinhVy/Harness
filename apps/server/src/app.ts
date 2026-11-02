import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { loadUser, requireAuth, requireRole, type AppEnv } from './auth/middleware.js';
import { createLoginLimiter } from './auth/rateLimit.js';
import { createSessionStore } from './auth/sessions.js';
import type { Db } from './db/database.js';
import { createAuditRepo } from './repos/audit.js';
import { createUserRepo } from './repos/users.js';
import { authRoutes } from './routes/auth.js';
import { securityMiddleware } from './security.js';

// Mọi phụ thuộc của server gom vào một chỗ: route chỉ nhận ctx, test thay được từng phần.
export function createAppContext(db: Db, opts: { now?: () => number } = {}) {
  const now = opts.now ?? Date.now;
  return {
    db,
    now,
    users: createUserRepo(db, now),
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

  const student = new Hono<AppEnv>();
  student.use('*', requireAuth(), requireRole('student'));
  student.get('/assignments', (c) => c.json([]));
  app.route('/api/student', student);

  const teacher = new Hono<AppEnv>();
  teacher.use('*', requireAuth(), requireRole('teacher', 'admin'));
  teacher.get('/classes', (c) => c.json([]));
  app.route('/api/teacher', teacher);

  app.all('/api/*', (c) => c.json({ error: 'Không tìm thấy' }, 404));
  app.onError((err, c) => {
    console.error('[server] lỗi khi xử lý request:', err);
    return c.json({ error: 'Lỗi nội bộ' }, 500);
  });
  return app;
}
