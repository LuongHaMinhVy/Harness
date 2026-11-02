import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APICallError } from 'ai';
import { expect, test, vi } from 'vitest';
import type { HarnessEvent } from '@harness/shared/events';
import { createWebSession } from '../src/webSession.js';
import { scriptedModel, type ScriptStep } from '@harness/core/testing/scriptedModel';

const grade = (student: string, score = 9) => ({
  name: 'save_grade',
  input: { assignment: 'sum-array', student, score, comments: 'Đúng hết test' },
});

function setup(script: ScriptStep[]) {
  const dir = mkdtempSync(join(tmpdir(), 'web-'));
  const goldenFile = join(dir, 'golden.json');
  writeFileSync(goldenFile, JSON.stringify({ nam: { score: 10, mustMention: [] } }));
  const session = createWebSession({
    model: scriptedModel(script),
    modelName: 'mock',
    dataDir: 'data',
    gradesFile: join(dir, 'grades.json'),
    evalGradesFile: join(dir, 'grades-eval.json'),
    cacheFile: join(dir, 'cache.json'),
    logDir: join(dir, 'logs'),
    goldenFile,
    maxSteps: 6,
    evalPauseMs: 0,
  });
  const events: HarnessEvent[] = [];
  session.subscribe((e) => events.push(e));
  return { session, events, dir };
}

test('ask phát sự kiện theo thứ tự và snapshot giữ transcript', async () => {
  const { session, events } = setup([
    { tools: [{ name: 'read_file', input: { path: 'submissions/sum-array/nam.js' } }] },
    { text: 'Nam được 10 điểm' },
  ]);
  expect(session.ask('Chấm bài của Nam')).toBe('started');
  await session.idle();
  expect(events.map((e) => e.type)).toEqual(['busy', 'question', 'step', 'step', 'summary', 'session', 'answer', 'busy']);
  const turn = session.snapshot().turns[0];
  expect(turn).toMatchObject({ n: 1, question: 'Chấm bài của Nam', answer: 'Nam được 10 điểm' });
  expect(turn.steps).toHaveLength(2);
  expect(turn.summary?.steps).toBe(2);
  expect(session.snapshot().busy).toBe(false);
});

test('save_grade chờ duyệt: snapshot có thẻ pending; approve → grade-saved và điểm được ghi', async () => {
  const { session, events } = setup([{ tools: [grade('nam')] }, { text: 'Đã lưu' }]);
  session.ask('Chấm bài của Nam');
  await vi.waitFor(() => expect(session.snapshot().turns[0].approvals).toHaveLength(1));
  const { id, status } = session.snapshot().turns[0].approvals[0];
  expect(status).toBe('pending');
  expect(session.approve(id, true)).toBe(true);
  await session.idle();
  expect(events.some((e) => e.type === 'grade-saved' && e.student === 'nam')).toBe(true);
  expect(session.grades()).toMatchObject([{ student: 'nam', score: 9 }]);
  expect(session.snapshot().turns[0].approvals[0].status).toBe('approved');
});

test('hai save_grade cùng lượt: hai thẻ chờ, duyệt từng cái đều được', async () => {
  const { session } = setup([{ tools: [grade('nam'), grade('lan', 8)] }, { text: 'xong' }]);
  session.ask('Chấm Nam và Lan');
  await vi.waitFor(() => expect(session.snapshot().turns[0].approvals).toHaveLength(2));
  for (const a of session.snapshot().turns[0].approvals) session.approve(a.id, true);
  await session.idle();
  expect(session.grades().map((g) => g.student)).toEqual(['lan', 'nam']);
});

test('lỗi API → sự kiện error, lịch sử không giữ câu hỏi lỗi, hết bận', async () => {
  const keyError = new APICallError({ message: 'API key not valid', url: 'x', requestBodyValues: {}, statusCode: 400 });
  const { session, events } = setup([{ throws: keyError }]);
  session.ask('Chấm bài của Nam');
  await session.idle();
  const err = events.find((e) => e.type === 'error');
  expect(err && err.type === 'error' && err.message).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
  expect(session.snapshot().turns[0].error).toBeDefined();
  expect(session.historyLength()).toBe(0);
  expect(session.snapshot().busy).toBe(false);
});

test('đang bận: ask, runEval → busy; reset → false; xong việc thì reset được', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { session } = setup([{ wait: gate, text: 'xong' }]);
  expect(session.ask('một')).toBe('started');
  expect(session.ask('hai')).toBe('busy');
  expect(session.runEval()).toBe('busy');
  expect(session.reset()).toBe(false);
  release();
  await session.idle();
  expect(session.reset()).toBe(true);
  expect(session.snapshot().turns).toEqual([]);
  expect(session.historyLength()).toBe(0);
});

test('setMaxSteps cập nhật snapshot và áp dụng cho câu sau', async () => {
  const { session } = setup([{ tools: [{ name: 'list_submissions', input: { assignment: 'sum-array' } }] }, { text: 'hết lượt' }]);
  session.setMaxSteps(1);
  expect(session.snapshot().maxSteps).toBe(1);
  session.ask('Liệt kê');
  await session.idle();
  expect(session.snapshot().turns[0].error).toBeUndefined();
  expect(session.snapshot().turns[0].summary).toMatchObject({ steps: 1, hitLimit: true, maxSteps: 1 });
});

test('runEval phát eval-row và eval-done, ghi vào file điểm eval, không đụng điểm thật', async () => {
  const { session, events, dir } = setup([{ tools: [grade('nam', 10)] }, { text: 'Nam 10 điểm' }]);
  expect(session.runEval()).toBe('started');
  await session.idle();
  const types = events.map((e) => e.type);
  expect(types).toContain('eval-start');
  expect(types).toContain('eval-row');
  expect(types.at(-2)).toBe('eval-done');
  expect(session.snapshot().eval).toMatchObject({ running: false, report: { mae: 0 } });
  expect(JSON.parse(readFileSync(join(dir, 'grades-eval.json'), 'utf8'))).toHaveLength(1);
  expect(session.grades()).toEqual([]);
});

test('mỗi sự kiện có seq tăng dần; snapshot.seq bằng seq của sự kiện cuối', async () => {
  const { session } = setup([{ text: 'chào' }]);
  const seqs: number[] = [];
  session.subscribe((_e, seq) => seqs.push(seq));
  session.ask('xin chào');
  await session.idle();
  expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  expect(new Set(seqs).size).toBe(seqs.length);
  expect(session.snapshot().seq).toBe(seqs.at(-1));
});

test('runEval: lỗi API ở một học viên → sự kiện eval-error có lý do', async () => {
  const keyError = new APICallError({ message: 'API key not valid', url: 'x', requestBodyValues: {}, statusCode: 400 });
  const { session, events } = setup([{ throws: keyError }]);
  session.runEval();
  await session.idle();
  const err = events.find((e) => e.type === 'eval-error');
  expect(err).toMatchObject({ type: 'eval-error', student: 'nam' });
  expect(err && err.type === 'eval-error' && err.message).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
  expect(session.snapshot().eval.errors).toHaveLength(1);
});

test('runEval: golden.json hỏng → eval-error chung, hết bận', async () => {
  const { session, events, dir } = setup([{ text: 'x' }]);
  writeFileSync(join(dir, 'golden.json'), '{hỏng');
  session.runEval();
  await session.idle();
  expect(events.some((e) => e.type === 'eval-error' && e.student === '')).toBe(true);
  expect(session.snapshot().busy).toBe(false);
});
