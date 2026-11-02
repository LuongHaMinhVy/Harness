import type { User } from '@harness/shared/api';
import { EMAIL_USERNAME, PASSWORD_MIN, PasswordSchema, UsernameSchema } from '@harness/shared/api';
import type { AppContext } from '../app.js';
import { generateTempPassword, hashPassword } from '../auth/password.js';

// Tạo tài khoản admin (dùng từ dòng lệnh — không có trang đăng ký công khai). Mật khẩu tạm, bắt đổi lần đầu.
export async function createAdminAccount(ctx: AppContext, username: string, fullName: string): Promise<{ user: User; tempPassword: string }> {
  const name = UsernameSchema.parse(username);
  if (ctx.users.exists(name)) throw new Error(`Tên đăng nhập "${name}" đã tồn tại`);
  const tempPassword = generateTempPassword();
  const user = ctx.users.create({ username: name, fullName: fullName.trim() || name, role: 'admin', passwordHash: await hashPassword(tempPassword), mustChangePassword: true });
  ctx.audit.log(null, 'user_created', user.username, { role: 'admin', via: 'cli' });
  return { user, tempPassword };
}

export type EnvAdminResult = { status: 'skipped' } | { status: 'created' | 'exists'; username: string };

// Tạo admin đầu tiên từ ADMIN_EMAIL/ADMIN_PASSWORD (đọc từ .env khi chạy seed). Email là tên đăng nhập.
// Mật khẩu do chủ máy tự đặt nên không bắt đổi lần đầu. Đã có tài khoản đó thì giữ nguyên — không ghi đè mật khẩu.
export async function seedAdminFromEnv(ctx: AppContext, env: Record<string, string | undefined>): Promise<EnvAdminResult> {
  const email = (env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = env.ADMIN_PASSWORD ?? '';
  if (!email && !password) return { status: 'skipped' };
  if (!email) throw new Error('Có ADMIN_PASSWORD nhưng thiếu ADMIN_EMAIL trong .env');
  if (!password) throw new Error('Có ADMIN_EMAIL nhưng thiếu ADMIN_PASSWORD trong .env');
  if (!EMAIL_USERNAME.test(email) || !UsernameSchema.safeParse(email).success) throw new Error(`ADMIN_EMAIL "${email}" không phải email hợp lệ`);
  if (!PasswordSchema.safeParse(password).success) throw new Error(`ADMIN_PASSWORD phải dài ${PASSWORD_MIN}–128 ký tự`);
  const existing = ctx.users.findCredentials(email);
  if (existing && existing.role !== 'admin') throw new Error(`Đã có tài khoản "${email}" nhưng không phải admin — đổi ADMIN_EMAIL`);
  if (existing) return { status: 'exists', username: existing.username };
  const user = ctx.users.create({ username: email, fullName: 'Quản trị', role: 'admin', passwordHash: await hashPassword(password), mustChangePassword: false });
  ctx.audit.log(null, 'user_created', user.username, { role: 'admin', via: 'env' });
  return { status: 'created', username: user.username };
}
