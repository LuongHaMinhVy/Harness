import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { cpSync, existsSync } from 'node:fs';
import { createTools, normalizeStudent, safeTool, type SubmissionLocator } from '../src/tools.js';
import { createTestCache } from '../src/toolCache.js';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'tools-'));
  const tools = createTools({
    dataDir: 'data',
    cache: createTestCache(join(dir, 'tests.json')),
    approve: async () => true,
    gradesFile: join(dir, 'grades.json'),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exec = (name: keyof typeof tools, args: unknown): Promise<any> =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tools[name].execute as any)(args, { toolCallId: 't', messages: [], context: {} });
  return { exec };
}

test('list_submissions liệt kê 5 học viên', async () => {
  const { exec } = setup();
  expect(await exec('list_submissions', { assignment: 'sum-array' })).toEqual({
    students: ['an', 'hung', 'lan', 'minh', 'nam'],
  });
});

test('list_submissions đề không tồn tại → assignment_not_found', async () => {
  const { exec } = setup();
  expect(await exec('list_submissions', { assignment: 'khong-co' })).toMatchObject({ error: 'assignment_not_found' });
});

test('read_file đọc rubric', async () => {
  const { exec } = setup();
  const r = await exec('read_file', { path: 'assignments/sum-array/rubric.md' });
  expect(r.content).toContain('TypeError');
});

test('read_file ../package.json → outside_data_dir', async () => {
  const { exec } = setup();
  expect(await exec('read_file', { path: '../package.json' })).toMatchObject({ error: 'outside_data_dir' });
});

test('read_file trỏ vào thư mục → not_found', async () => {
  const { exec } = setup();
  expect(await exec('read_file', { path: 'submissions/sum-array' })).toMatchObject({ error: 'not_found' });
});

test('run_tests "Nam.js" được chuẩn hoá thành nam, 5/5', async () => {
  const { exec } = setup();
  const r = await exec('run_tests', { assignment: 'sum-array', student: ' Nam.js ' });
  expect(r).toMatchObject({ status: 'ok', passed: 5, total: 5, cached: false });
  expect(typeof r.durationMs).toBe('number');
});

test('normalizeStudent bỏ dấu tiếng Việt: "Hùng" → hung, "Đức.js" → duc', () => {
  expect(normalizeStudent('Hùng')).toBe('hung');
  expect(normalizeStudent(' Đức.js ')).toBe('duc');
  expect(normalizeStudent('Lân')).toBe('lan');
});

test('run_tests "Lân" tìm được bài của lan', async () => {
  const { exec } = setup();
  expect(await exec('run_tests', { assignment: 'sum-array', student: 'Lân' })).toMatchObject({ status: 'ok', passed: 4 });
});

test('run_tests lần 2 cùng bài → cached true', async () => {
  const { exec } = setup();
  await exec('run_tests', { assignment: 'sum-array', student: 'lan' });
  expect(await exec('run_tests', { assignment: 'sum-array', student: 'lan' })).toMatchObject({
    status: 'ok',
    passed: 4,
    cached: true,
  });
});

test('run_tests học viên tuan → student_not_found kèm hint', async () => {
  const { exec } = setup();
  const r = await exec('run_tests', { assignment: 'sum-array', student: 'tuan' });
  expect(r).toMatchObject({ error: 'student_not_found' });
  expect(r.hint).toContain('list_submissions');
});

test('safeTool biến Error thường thành { error: "internal" }', async () => {
  const wrapped = safeTool(async () => {
    throw new Error('hỏng');
  });
  expect(await wrapped({})).toEqual({ error: 'internal', message: 'hỏng' });
});

test('list_files với dữ liệu mẫu: bài một file, kèm thư mục để read_file', async () => {
  const { exec } = setup();
  expect(await exec('list_files', { assignment: 'sum-array', student: 'Nam' })).toEqual({
    student: 'nam',
    entry: 'nam.js',
    base: 'submissions/sum-array',
    files: ['nam.js'],
  });
});

// Dữ liệu kiểu web: bài nộp nhiều file trong data/submissions/<đề>/<hv>/v1/.
function webSetup(extra: Partial<Parameters<typeof createTools>[0]> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'web-tools-'));
  cpSync('data/assignments/sum-array', join(dir, 'assignments', 'sum-array'), { recursive: true });
  cpSync('packages/core/test/fixtures/multi', join(dir, 'submissions', 'sum-array', 'nam', 'v1'), { recursive: true });
  cpSync('data/submissions/sum-array/lan.js', join(dir, 'submissions', 'sum-array', 'lan', 'v1', 'index.js'));
  const locator: SubmissionLocator = {
    students: () => ['nam'],
    locate: (_a, raw) => {
      const student = normalizeStudent(raw);
      return { student, dir: join(dir, 'submissions', 'sum-array', student, 'v1'), entry: 'index.js', files: ['index.js', 'lib/add.js'] };
    },
  };
  const saved: unknown[] = [];
  const tools = createTools({
    dataDir: dir,
    cache: createTestCache(join(dir, 'cache.json')),
    approve: async () => true,
    gradesFile: join(dir, 'grades.json'),
    locator,
    readScope: ['assignments/sum-array/', 'submissions/sum-array/nam/v1/'],
    saveGrade: async (req) => {
      saved.push(req);
      return { status: 'proposed' };
    },
    ...extra,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exec = (name: keyof typeof tools, args: unknown): Promise<any> => (tools[name].execute as any)(args, { toolCallId: 't', messages: [], context: {} });
  return { exec, saved, dir };
}

test('locator kiểu web: list_files trả mọi file, run_tests chạy file chính nhiều module', async () => {
  const { exec } = webSetup();
  expect(await exec('list_files', { assignment: 'sum-array', student: 'nam' })).toEqual({
    student: 'nam',
    entry: 'index.js',
    base: 'submissions/sum-array/nam/v1',
    files: ['index.js', 'lib/add.js'],
  });
  expect(await exec('run_tests', { assignment: 'sum-array', student: 'nam' })).toMatchObject({ status: 'ok', passed: 5, total: 5 });
  expect((await exec('read_file', { path: 'submissions/sum-array/nam/v1/lib/add.js' })).content).toContain('exports.add');
});

test('readScope: không đọc được bài của học viên khác trong lúc chấm', async () => {
  const { exec } = webSetup();
  expect(await exec('read_file', { path: 'submissions/sum-array/lan/v1/index.js' })).toMatchObject({ error: 'outside_scope' });
  expect(await exec('read_file', { path: 'assignments/sum-array/rubric.md' })).toMatchObject({ path: 'assignments/sum-array/rubric.md' });
});

test('saveGrade tuỳ chỉnh: chỉ ghi điểm đề xuất, không ghi file grades, không hỏi duyệt', async () => {
  let asked = false;
  const { exec, saved, dir } = webSetup({ approve: async () => ((asked = true), true) });
  const r = await exec('save_grade', { assignment: 'sum-array', student: 'Nam', score: 9, comments: 'Tốt' });
  expect(r).toEqual({ status: 'proposed' });
  expect(saved).toEqual([{ assignment: 'sum-array', student: 'nam', score: 9, comments: 'Tốt' }]);
  expect(asked).toBe(false);
  expect(existsSync(join(dir, 'grades.json'))).toBe(false);
});
