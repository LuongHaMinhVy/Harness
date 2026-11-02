import { ChangePasswordBody, LoginBody } from '@harness/shared/api';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { AppContext } from '../app.js';
import { requireAuth, SESSION_COOKIE, type AppEnv } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { SESSION_TTL_MS } from '../auth/sessions.js';
import { parseJson } from './parse.js';

const BAD_LOGIN = 'Sai tài khoản hoặc mật khẩu';
const LOCKED = 'Đăng nhập sai quá nhiều lần — thử lại sau 15 phút';

export function authRoutes(ctx: AppContext, opts: { secureCookie: boolean }) {
  const app = new Hono<AppEnv>();
  // Hash giả để đăng nhập với tên không tồn tại vẫn tốn thời gian như thật (không lộ tài khoản có tồn tại).
  const dummyHash = hashPassword('khong-dung-de-dang-nhap');

  const issueSession = (c: Parameters<typeof setCookie>[0], userId: number) => {
    const token = ctx.sessions.create(userId);
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/',
      secure: opts.secureCookie,
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
  };

  app.post('/login', async (c) => {
    const body = await parseJson(c, LoginBody);
    if (body instanceof Response) return body;
    const userKey = `user:${body.username.toLowerCase()}`;
    const ipKey = `ip:${ctx.clientIp(c)}`;
    if (ctx.loginLimiter.isLocked(userKey) || ctx.ipLimiter.isLocked(ipKey)) return c.json({ error: LOCKED }, 429);

    const creds = ctx.users.findCredentials(body.username);
    const ok = creds ? await verifyPassword(body.password, creds.passwordHash) : await verifyPassword(body.password, await dummyHash);
    if (!creds || !ok || creds.disabled) {
      ctx.loginLimiter.fail(userKey);
      ctx.ipLimiter.fail(ipKey);
      ctx.audit.log(creds?.id ?? null, 'login_failed', body.username);
      return c.json({ error: BAD_LOGIN }, 401);
    }
    ctx.loginLimiter.succeed(userKey);
    issueSession(c, creds.id);
    ctx.audit.log(creds.id, 'login');
    const { passwordHash: _omit, ...user } = creds;
    return c.json({ user });
  });

  app.post('/logout', (c) => {
    const token = c.get('sessionToken');
    if (token) ctx.sessions.destroy(token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/me', requireAuth(), (c) => c.json({ user: c.get('user') }));

  app.post('/change-password', requireAuth(), async (c) => {
    const user = c.get('user')!;
    const body = await parseJson(c, ChangePasswordBody);
    if (body instanceof Response) return body;
    const current = ctx.users.passwordHash(user.id);
    if (!current || !(await verifyPassword(body.currentPassword, current))) {
      return c.json({ error: 'Mật khẩu hiện tại không đúng' }, 400);
    }
    ctx.users.setPassword(user.id, await hashPassword(body.newPassword), false);
    // Đổi mật khẩu thì huỷ mọi phiên cũ (kể cả trên máy khác), cấp phiên mới cho máy này.
    ctx.sessions.destroyAllForUser(user.id);
    issueSession(c, user.id);
    ctx.audit.log(user.id, 'password_changed');
    return c.json({ user: ctx.users.findById(user.id) });
  });

  return app;
}
