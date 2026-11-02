// Chạy web lớp học với model giả (không cần API key, không gọi Gemini) và database riêng (data/app-mock.db)
// có sẵn dữ liệu demo — để thử giao diện. Không dùng cho lớp học thật.
import { MOCK_PATHS } from '@harness/core/config';
import { hashPassword } from '../auth/password.js';
import { seedDemo } from '../cli/seed.js';
import { parseNetworkConfig } from '../network.js';
import { parsePort, startWebServer } from '../start.js';
import { createMockModel } from './mockModel.js';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-12345';

await startWebServer({
  model: createMockModel(),
  modelName: 'mock (không gọi Gemini)',
  paths: MOCK_PATHS,
  maxSteps: 8,
  port: parsePort(process.env.PORT),
  dev: process.argv.includes('--dev'),
  network: parseNetworkConfig(process.env, process.argv),
  prepare: async (ctx) => {
    const seeded = await seedDemo(ctx, { password: DEMO_PASSWORD });
    if (!ctx.users.exists('admin')) {
      ctx.users.create({ username: 'admin', fullName: 'Quản trị demo', role: 'admin', passwordHash: await hashPassword(DEMO_PASSWORD) });
    }
    if (seeded.created) console.log('Đã tạo dữ liệu demo trong data/app-mock.db.');
    console.log(`Tài khoản demo (mật khẩu "${DEMO_PASSWORD}"): admin · gv.demo · nam, lan, an, hung, minh`);
  },
});
