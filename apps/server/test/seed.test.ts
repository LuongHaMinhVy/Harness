import { existsSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createAppContext } from '../src/app.js';
import { verifyPassword } from '../src/auth/password.js';
import { createAdminAccount } from '../src/cli/admin.js';
import { seedDemo } from '../src/cli/seed.js';
import { memoryDb } from './helpers.js';

function ctxWithSampleData() {
  const dataDir = mkdtempSync(join(tmpdir(), 'seed-'));
  cpSync('data/assignments/sum-array', join(dataDir, 'assignments', 'sum-array'), { recursive: true });
  // Chỉ chép bài mẫu (*.js), bỏ qua thư mục bài nộp web có thể còn sót trong data/ của máy dev.
  const samples = 'data/submissions/sum-array';
  cpSync(samples, join(dataDir, 'submissions', 'sum-array'), { recursive: true, filter: (src) => src === samples || src.endsWith('.js') });
  const webDir = join(dataDir, 'web');
  const ctx = createAppContext(memoryDb(), {
    paths: {
      dataDir,
      webDir,
      gradesFile: join(dataDir, 'g.json'),
      evalGradesFile: join(dataDir, 'ge.json'),
      cacheFile: join(dataDir, 'c.json'),
      logDir: join(dataDir, 'logs'),
      goldenFile: join(dataDir, 'golden.json'),
    },
  });
  return { ctx, dataDir, webDir };
}

test('createAdminAccount: tạo admin với mật khẩu tạm (bắt đổi lần đầu); trùng tên → lỗi', async () => {
  const { ctx } = ctxWithSampleData();
  const { user, tempPassword } = await createAdminAccount(ctx, 'quantri', 'Quản trị');
  expect(user).toMatchObject({ username: 'quantri', role: 'admin', mustChangePassword: true });
  expect(await verifyPassword(tempPassword, ctx.users.passwordHash(user.id)!)).toBe(true);
  await expect(createAdminAccount(ctx, 'quantri', 'X')).rejects.toThrow(/đã tồn tại/);
});

test('seedDemo: giảng viên, lớp, 5 học viên, đề sum-array, 5 bài nộp v1 từ dữ liệu mẫu; chạy lại không nhân đôi', async () => {
  const { ctx, dataDir, webDir } = ctxWithSampleData();
  const first = await seedDemo(ctx, { password: 'demo-12345' });
  expect(first.created).toBe(true);
  const teacher = ctx.users.findCredentials('gv.demo')!;
  expect(await verifyPassword('demo-12345', teacher.passwordHash)).toBe(true);
  const [cls] = ctx.classes.listFor(teacher);
  expect(ctx.classes.members(cls.id).map((u) => u.username)).toEqual(['an', 'hung', 'lan', 'minh', 'nam']);
  const a = ctx.assignments.findBySlug('sum-array')!;
  expect(a.entryFile).toBe('index.js');
  expect(ctx.submissions.latestForAssignment(a.id)).toHaveLength(5);
  // Đề và bài nộp của web nằm trong webDir, không trộn vào dữ liệu mẫu của CLI.
  expect(existsSync(join(webDir, 'submissions', 'sum-array', 'nam', 'v1', 'index.js'))).toBe(true);
  expect(existsSync(join(webDir, 'assignments', 'sum-array', 'tests.js'))).toBe(true);
  expect(existsSync(join(dataDir, 'submissions', 'sum-array', 'nam'))).toBe(false);
  const again = await seedDemo(ctx, { password: 'demo-12345' });
  expect(again.created).toBe(false);
  expect(ctx.submissions.latestForAssignment(a.id)).toHaveLength(5);
});
