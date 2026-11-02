import type { User } from '@harness/shared/api';
import { UsernameSchema } from '@harness/shared/api';
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
