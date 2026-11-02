import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppContext } from '../app.js';
import { writeAssignmentFiles } from '../assignments/files.js';
import { hashPassword } from '../auth/password.js';
import { saveSubmissionFiles, submissionDir } from '../uploads/store.js';

const STUDENTS: [string, string][] = [
  ['nam', 'Nguyễn Văn Nam'],
  ['lan', 'Trần Thị Lan'],
  ['an', 'Lê Văn An'],
  ['hung', 'Phạm Văn Hùng'],
  ['minh', 'Đỗ Minh'],
];

// Dữ liệu demo: giảng viên gv.demo, lớp "Lớp demo JS", 5 học viên, đề sum-array (chép từ đề mẫu
// data/assignments/sum-array) và 5 bài nộp v1 lấy từ bài mẫu, ghi vào ctx.webDir. Chạy lại không tạo trùng.
// Chỉ dùng để thử/quay video.
export async function seedDemo(ctx: AppContext, opts: { password: string }): Promise<{ created: boolean; usernames: string[] }> {
  if (ctx.users.exists('gv.demo')) return { created: false, usernames: [] };
  const hash = await hashPassword(opts.password);
  const teacher = ctx.users.create({ username: 'gv.demo', fullName: 'Giảng viên demo', role: 'teacher', passwordHash: hash });
  const cls = ctx.classes.create('Lớp demo JS', teacher.id);
  const dir = join(ctx.paths.dataDir, 'assignments', 'sum-array');
  const content = {
    description: readFileSync(join(dir, 'README.md'), 'utf8').replace('`module.exports = { sumArray }`', '`module.exports = { sumArray }` trong file `index.js`'),
    rubric: readFileSync(join(dir, 'rubric.md'), 'utf8'),
    tests: readFileSync(join(dir, 'tests.js'), 'utf8'),
  };
  writeAssignmentFiles(ctx.webDir, 'sum-array', content);
  const a = ctx.assignments.create(
    'sum-array',
    { title: 'Tính tổng mảng (sumArray)', description: content.description, rubric: content.rubric, entryFile: 'index.js', classId: cls.id, dueAt: null },
    teacher.id,
  );
  for (const [username, fullName] of STUDENTS) {
    const student = ctx.users.exists(username)
      ? ctx.users.findCredentials(username)!
      : ctx.users.create({ username, fullName, role: 'student', passwordHash: hash });
    ctx.classes.addMember(cls.id, student.id);
    const source = readFileSync(join(ctx.paths.dataDir, 'submissions', 'sum-array', `${username}.js`));
    const files = saveSubmissionFiles(submissionDir(ctx.webDir, a.slug, username, 1), [{ path: 'index.js', data: new Uint8Array(source) }]);
    ctx.submissions.create(a.id, student.id, 1, files);
  }
  ctx.audit.log(null, 'seed_demo', 'gv.demo', { classId: cls.id, assignmentId: a.id });
  return { created: true, usernames: ['gv.demo', ...STUDENTS.map(([u]) => u)] };
}
