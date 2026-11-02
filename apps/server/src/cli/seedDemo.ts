// pnpm seed:demo — tạo dữ liệu demo (giảng viên gv.demo, lớp, 5 học viên, đề sum-array, 5 bài nộp) trong data/app.db.
// Mật khẩu lấy từ DEMO_PASSWORD hoặc sinh ngẫu nhiên và in ra một lần.
import { APP_PATHS } from '@harness/core/config';
import { createAppContext } from '../app.js';
import { generateTempPassword } from '../auth/password.js';
import { openDatabase } from '../db/database.js';
import { seedDemo } from './seed.js';

const password = process.env.DEMO_PASSWORD ?? generateTempPassword();
const ctx = createAppContext(openDatabase(APP_PATHS.dbFile ?? 'data/app.db'));
const r = await seedDemo(ctx, { password });
if (!r.created) {
  console.log('Dữ liệu demo đã có sẵn (tài khoản gv.demo đã tồn tại) — không tạo lại.');
} else {
  console.log(`Đã tạo dữ liệu demo. Tài khoản: ${r.usernames.join(', ')}`);
  console.log(`Mật khẩu chung (chỉ hiện lần này): ${password}`);
}
