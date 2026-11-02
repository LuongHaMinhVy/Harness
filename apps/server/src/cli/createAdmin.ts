// pnpm admin:create <tên-đăng-nhập> "<Họ tên>" — tạo tài khoản admin, in mật khẩu tạm một lần.
import { APP_PATHS } from '@harness/core/config';
import { createAppContext } from '../app.js';
import { openDatabase } from '../db/database.js';
import { createAdminAccount } from './admin.js';

const [username, fullName = ''] = process.argv.slice(2);
if (!username) {
  console.error('Cách dùng: pnpm admin:create <tên-đăng-nhập> "<Họ tên>"');
  process.exit(1);
}
try {
  const ctx = createAppContext(openDatabase(APP_PATHS.dbFile ?? 'data/app.db'));
  const { user, tempPassword } = await createAdminAccount(ctx, username, fullName);
  console.log(`Đã tạo admin "${user.username}". Mật khẩu tạm (chỉ hiện lần này): ${tempPassword}`);
  console.log('Đăng nhập rồi đổi mật khẩu ngay.');
} catch (err) {
  console.error(`Không tạo được admin: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
