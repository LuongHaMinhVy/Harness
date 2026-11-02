import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppContext } from '../app.js';
import { hashPassword } from '../auth/password.js';
import { saveSubmissionFiles, submissionDir } from '../uploads/store.js';

const STUDENTS: [string, string][] = [
  ['nam', 'Nguyễn Văn Nam'],
  ['lan', 'Trần Thị Lan'],
  ['an', 'Lê Văn An'],
  ['hung', 'Phạm Văn Hùng'],
  ['minh', 'Đỗ Minh'],
];

// Dữ liệu demo: giảng viên gv.demo, lớp "Lớp demo JS", 5 học viên, đề sum-array (dùng file đề có sẵn trong
// data/assignments/sum-array) và 5 bài nộp v1 lấy từ bài mẫu. Chạy lại không tạo trùng. Chỉ dùng để thử/quay video.
export async function seedDemo(ctx: AppContext, opts: { password: string }): Promise<{ created: boolean; usernames: string[] }> {
  if (ctx.users.exists('gv.demo')) return { created: false, usernames: [] };
  const hash = await hashPassword(opts.password);
  const teacher = ctx.users.create({ username: 'gv.demo', fullName: 'Giảng viên demo', role: 'teacher', passwordHash: hash });
  const cls = ctx.classes.create('Lớp demo JS', teacher.id);
  const dir = join(ctx.paths.dataDir, 'assignments', 'sum-array');
  const a = ctx.assignments.create(
    'sum-array',
    {
      title: 'Tính tổng mảng (sumArray)',
      description: readFileSync(join(dir, 'README.md'), 'utf8').replace('`module.exports = { sumArray }`', '`module.exports = { sumArray }` trong file `index.js`'),
      rubric: readFileSync(join(dir, 'rubric.md'), 'utf8'),
      entryFile: 'index.js',
      classId: cls.id,
      dueAt: null,
    },
    teacher.id,
  );
  for (const [username, fullName] of STUDENTS) {
    const student = ctx.users.exists(username)
      ? ctx.users.findCredentials(username)!
      : ctx.users.create({ username, fullName, role: 'student', passwordHash: hash });
    ctx.classes.addMember(cls.id, student.id);
    const source = readFileSync(join(ctx.paths.dataDir, 'submissions', 'sum-array', `${username}.js`));
    const files = saveSubmissionFiles(submissionDir(ctx.paths.dataDir, a.slug, username, 1), [{ path: 'index.js', data: new Uint8Array(source) }]);
    ctx.submissions.create(a.id, student.id, 1, files);
  }
  ctx.audit.log(null, 'seed_demo', 'gv.demo', { classId: cls.id, assignmentId: a.id });
  return { created: true, usernames: ['gv.demo', ...STUDENTS.map(([u]) => u)] };
}
