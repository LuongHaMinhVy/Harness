import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createLogger, formatStep, formatSummary, usageOf, type StepLog } from '../src/logger.js';

const usage = { input: 1000, cached: 800, output: 50 };
const step = (over: Partial<StepLog>): StepLog => ({
  index: 1, toolCalls: [], finishReason: 'tool-calls', usage, ms: 120, ...over,
});
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

test('usageOf đọc cacheReadTokens của ai v7', () => {
  expect(usageOf({ inputTokens: 1000, outputTokens: 50, inputTokenDetails: { cacheReadTokens: 800 } })).toEqual(usage);
});

test('usageOf không có số liệu cache → cached null', () => {
  expect(usageOf({ inputTokens: 10, outputTokens: 2, inputTokenDetails: {} }).cached).toBeNull();
});

test('formatStep run_tests cached → chứa "CACHE HIT"', () => {
  const out = strip(formatStep(step({
    toolCalls: [{ name: 'run_tests', input: { student: 'nam' }, output: { status: 'ok', passed: 5, total: 5, cached: true, cacheKey: '3fa2' } }],
  })));
  expect(out).toContain('🔧 run_tests');
  expect(out).toContain('CACHE HIT (3fa2…)');
  expect(out).toContain('cache 800 · 80%');
});

test('formatStep lỗi tool → chứa "✖ read_file → not_found"', () => {
  const out = strip(formatStep(step({
    toolCalls: [{ name: 'read_file', input: { path: 'x' }, output: { error: 'not_found', message: 'Không tìm thấy' } }],
  })));
  expect(out).toContain('✖ read_file → not_found');
});

test('formatStep timeout → chứa "TIMEOUT 3s"', () => {
  const out = strip(formatStep(step({
    toolCalls: [{ name: 'run_tests', input: {}, output: { status: 'timeout', timeoutMs: 3000, cached: false, durationMs: 3010 } }],
  })));
  expect(out).toContain('TIMEOUT 3s');
});

test('formatStep cắt output dài còn ≤ 200 ký tự', () => {
  const out = strip(formatStep(step({
    toolCalls: [{ name: 'read_file', input: { path: 'a' }, output: { content: 'x'.repeat(5000) } }],
  })));
  const resultLine = out.split('\n').find((l) => l.includes('→'))!;
  expect(resultLine.length).toBeLessThanOrEqual(230);
});

test('formatStep không có tool → "💬 trả lời (stop)", cache null → "cache n/a"', () => {
  const out = strip(formatStep(step({ finishReason: 'stop', text: 'xong', usage: { input: 10, cached: null, output: 2 } })));
  expect(out).toContain('💬 trả lời (stop)');
  expect(out).toContain('cache n/a');
});

test('formatSummary hitLimit → chứa "Đã dùng hết 2/2 lượt"', () => {
  const out = strip(formatSummary([step({}), step({ index: 2 })], 3800, true, 2));
  expect(out).toContain('Tổng: 2 lượt');
  expect(out).toContain('(quy đổi)');
  expect(out).toContain('Đã dùng hết 2/2 lượt');
});

test('createLogger ghi 1 dòng JSONL mỗi step', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'log-')), 'logs', 's.jsonl');
  const logger = createLogger({ file, print: () => {} });
  logger.startQuestion(1, 'Chấm bài của Nam');
  logger.step(step({}));
  logger.step(step({ index: 2 }));
  const total = logger.endQuestion([step({}), step({ index: 2 })], 1000, false, 6);
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  expect(lines.filter((l) => JSON.parse(l).type === 'step')).toHaveLength(2);
  expect(total.input).toBe(2000);
  expect(logger.sessionTotal().questions).toBe(1);
});
