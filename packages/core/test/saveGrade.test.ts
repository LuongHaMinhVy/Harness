import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { createConsoleApprover, type Approver } from '../src/approval.js';
import { createTools } from '../src/tools.js';
import { createTestCache } from '../src/toolCache.js';

function setup(approve: Approver) {
  const dir = mkdtempSync(join(tmpdir(), 'grade-'));
  const gradesFile = join(dir, 'grades.json');
  const tools = createTools({ dataDir: 'data', cache: createTestCache(join(dir, 'c.json')), approve, gradesFile });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const save = (args: unknown): Promise<any> =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tools.save_grade.execute as any)(args, { toolCallId: 't', messages: [], context: {} });
  const grades = () => JSON.parse(readFileSync(gradesFile, 'utf8'));
  return { save, grades, gradesFile };
}

const req = { assignment: 'sum-array', student: 'nam', score: 9, comments: 'Đúng hết test' };

test('duyệt → ghi vào grades file', async () => {
  const { save, grades } = setup(async () => true);
  expect(await save(req)).toEqual({ status: 'saved' });
  expect(grades()).toHaveLength(1);
  expect(grades()[0]).toMatchObject({ assignment: 'sum-array', student: 'nam', score: 9 });
});

test('chấm lại cùng học viên → ghi đè, vẫn 1 bản ghi', async () => {
  const { save, grades } = setup(async () => true);
  await save(req);
  await save({ ...req, score: 7 });
  expect(grades()).toHaveLength(1);
  expect(grades()[0].score).toBe(7);
});

test('từ chối → rejected_by_user, file không đổi', async () => {
  const { save, gradesFile } = setup(async () => false);
  expect(await save(req)).toEqual({ status: 'rejected_by_user' });
  expect(existsSync(gradesFile)).toBe(false);
});

test('học viên không tồn tại → student_not_found, không hỏi duyệt', async () => {
  const approve = vi.fn(async () => true);
  const { save } = setup(approve);
  expect(await save({ ...req, student: 'tuan' })).toMatchObject({ error: 'student_not_found' });
  expect(approve).not.toHaveBeenCalled();
});

test('createConsoleApprover: 2 yêu cầu cùng lúc được hỏi lần lượt, không chồng nhau', async () => {
  let active = 0;
  let maxActive = 0;
  const approve = createConsoleApprover(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 20));
    active--;
    return 'y';
  });
  const results = await Promise.all([approve(req), approve({ ...req, student: 'lan' })]);
  expect(results).toEqual([true, true]);
  expect(maxActive).toBe(1);
});

test('createConsoleApprover: "Y" → true, "n" → false, "" → false', async () => {
  const answers = ['Y', 'n', ''];
  const prompts: string[] = [];
  const approve = createConsoleApprover(async (q) => {
    prompts.push(q);
    return answers.shift()!;
  });
  expect(await approve(req)).toBe(true);
  expect(await approve(req)).toBe(false);
  expect(await approve(req)).toBe(false);
  expect(prompts[0]).toContain('nam · 9/10');
});
