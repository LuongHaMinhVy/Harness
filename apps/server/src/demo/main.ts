// pnpm web:demo — web lớp học với Gemini THẬT trên dữ liệu demo riêng (data/app-demo.db, data/web-demo):
// có sẵn admin, gv.demo và 5 học viên, mật khẩu chung DEMO_PASSWORD (mặc định demo-12345).
// Dùng để tập và quay video mà không đụng dữ liệu lớp thật trong data/app.db. Free tier: ~20 lần gọi/ngày.
import 'dotenv/config';
import { existsSync, rmSync } from 'node:fs';
import { DEMO_PATHS } from '@harness/core/config';
import { seedDemoAccounts } from '../cli/seed.js';
import { createGeminiModel } from '../gemini.js';
import { parseNetworkConfig } from '../network.js';
import { parseMaxSteps, parsePort, startWebServer } from '../start.js';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-12345';

// Xoá data/app-demo.db để làm lại từ đầu → bỏ luôn đề/bài nộp cũ đi kèm.
if (!existsSync(DEMO_PATHS.dbFile!)) rmSync(DEMO_PATHS.webDir!, { recursive: true, force: true });

const { model, modelName } = createGeminiModel();
await startWebServer({
  model,
  modelName,
  paths: DEMO_PATHS,
  maxSteps: parseMaxSteps(process.env.MAX_STEPS),
  port: parsePort(process.env.PORT),
  dev: process.argv.includes('--dev'),
  network: parseNetworkConfig(process.env, process.argv),
  prepare: async (ctx) => {
    if ((await seedDemoAccounts(ctx, DEMO_PASSWORD)).created) console.log('Đã tạo dữ liệu demo trong data/app-demo.db.');
    console.log(`Tài khoản demo (mật khẩu "${DEMO_PASSWORD}"): admin · gv.demo · nam, lan, an, hung, minh`);
  },
});
