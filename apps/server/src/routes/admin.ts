import { CreateStaffBody, DisableBody, ROLES, type Role } from '@harness/shared/api';
import { Hono } from 'hono';
import type { AppContext } from '../app.js';
import { requireAuth, requireRole, type AppEnv } from '../auth/middleware.js';
import { generateTempPassword, hashPassword } from '../auth/password.js';
import { idParam, parseJson } from './parse.js';

// API admin: tài khoản giảng viên/admin, khoá tài khoản, nhật ký hoạt động.
// (Tài khoản học viên do giảng viên tạo trong lớp.)
export function adminRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth(), requireRole('admin'));

  app.get('/users', (c) => {
    const role = c.req.query('role');
    return c.json(ctx.users.list(ROLES.includes(role as Role) ? (role as Role) : undefined));
  });

  app.post('/users', async (c) => {
    const actor = c.get('user')!;
    const body = await parseJson(c, CreateStaffBody);
    if (body instanceof Response) return body;
    if (ctx.users.exists(body.username)) return c.json({ error: 'Tên đăng nhập đã tồn tại' }, 409);
    const tempPassword = generateTempPassword();
    const user = ctx.users.create({ ...body, passwordHash: await hashPassword(tempPassword), mustChangePassword: true });
    ctx.audit.log(actor.id, 'user_created', user.username, { role: user.role });
    return c.json({ user, tempPassword }, 201);
  });

  app.post('/users/:id/disable', async (c) => {
    const actor = c.get('user')!;
    const id = idParam(c);
    const target = id && ctx.users.findById(id);
    if (!target) return c.json({ error: 'Không tìm thấy' }, 404);
    const body = await parseJson(c, DisableBody);
    if (body instanceof Response) return body;
    if (target.id === actor.id) return c.json({ error: 'Không thể tự khoá tài khoản của mình' }, 400);
    ctx.users.setDisabled(target.id, body.disabled);
    if (body.disabled) ctx.sessions.destroyAllForUser(target.id);
    ctx.audit.log(actor.id, body.disabled ? 'user_disabled' : 'user_enabled', target.username);
    return c.json({ user: ctx.users.findById(target.id) });
  });

  app.post('/users/:id/reset-password', async (c) => {
    const actor = c.get('user')!;
    const id = idParam(c);
    const target = id && ctx.users.findById(id);
    if (!target) return c.json({ error: 'Không tìm thấy' }, 404);
    const tempPassword = generateTempPassword();
    ctx.users.setPassword(target.id, await hashPassword(tempPassword), true);
    ctx.sessions.destroyAllForUser(target.id);
    ctx.audit.log(actor.id, 'password_reset', target.username);
    return c.json({ tempPassword });
  });

  app.get('/audit', (c) => {
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 200, 1), 1000);
    return c.json(ctx.audit.list(limit));
  });

  return app;
}
