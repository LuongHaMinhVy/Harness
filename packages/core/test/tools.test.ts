import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createTools, normalizeStudent, safeTool } from '../src/tools.js';
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
