// pnpm seed:demo — tạo admin từ ADMIN_EMAIL/ADMIN_PASSWORD trong .env (nếu có), rồi dữ liệu demo
// (giảng viên gv.demo, lớp, 5 học viên, đề sum-array, 5 bài nộp) trong data/app.db.
// Mật khẩu demo lấy từ DEMO_PASSWORD hoặc sinh ngẫu nhiên và in ra một lần. Không bao giờ in ADMIN_PASSWORD.
import 'dotenv/config';
import { APP_PATHS } from '@harness/core/config';
import { createAppContext } from '../app.js';
import { generateTempPassword } from '../auth/password.js';
import { openDatabase } from '../db/database.js';
import { seedAdminFromEnv } from './admin.js';
import { seedDemo } from './seed.js';

const ctx = createAppContext(openDatabase(APP_PATHS.dbFile ?? 'data/app.db'));

try {
  const admin = await seedAdminFromEnv(ctx, process.env);
  if (admin.status === 'created') console.log(`Đã tạo admin "${admin.username}" (mật khẩu: ADMIN_PASSWORD trong .env).`);
  else if (admin.status === 'exists') console.log(`Admin "${admin.username}" đã có — giữ nguyên mật khẩu đang dùng.`);
  else console.log('Bỏ qua tạo admin (chưa đặt ADMIN_EMAIL/ADMIN_PASSWORD trong .env).');
} catch (err) {
  console.error(`Không tạo được admin: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const password = process.env.DEMO_PASSWORD || generateTempPassword();
const r = await seedDemo(ctx, { password });
if (!r.created) {
  console.log('Dữ liệu demo đã có sẵn (tài khoản gv.demo đã tồn tại) — không tạo lại.');
} else {
  console.log(`Đã tạo dữ liệu demo. Tài khoản: ${r.usernames.join(', ')}`);
  console.log(`Mật khẩu chung (chỉ hiện lần này): ${password}`);
}
