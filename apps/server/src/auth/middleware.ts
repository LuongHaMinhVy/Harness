import type { Role, User } from '@harness/shared/api';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { SessionStore } from './sessions.js';

export const SESSION_COOKIE = 'sid';

export type AppEnv = { Variables: { user: User | null; sessionToken: string | null } };
export type AuthedEnv = { Variables: { user: User; sessionToken: string } };

// Đọc cookie phiên và gắn người dùng (hoặc null) vào context cho mọi request.
export function loadUser(sessions: SessionStore): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE) ?? null;
    c.set('sessionToken', token);
    c.set('user', token ? sessions.get(token) : null);
    await next();
  };
}

const deny = (c: Context, status: 401 | 403, error: string) => c.json({ error }, status);

// Bắt buộc đăng nhập; tài khoản phải đổi mật khẩu thì chỉ được gọi /api/auth/*.
export function requireAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) return deny(c, 401, 'Chưa đăng nhập');
    if (user.mustChangePassword && !new URL(c.req.url).pathname.startsWith('/api/auth/')) {
      return deny(c, 403, 'must_change_password');
    }
    await next();
  };
}

export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) return deny(c, 401, 'Chưa đăng nhập');
    if (!roles.includes(user.role)) return deny(c, 403, 'Không có quyền');
    await next();
  };
}
