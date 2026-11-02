import { expect, test } from 'vitest';
import { summarizeToolOutput } from '@harness/shared/format';

test('lỗi tool → tone error, chữ "✖ tên → mã: thông báo"', () => {
  expect(summarizeToolOutput('read_file', { error: 'not_found', message: 'Không tìm thấy' })).toEqual({
    text: '✖ read_file → not_found: Không tìm thấy',
    tone: 'error',
  });
});

test('run_tests cache hit → nhãn CACHE HIT kèm key', () => {
  expect(summarizeToolOutput('run_tests', { status: 'ok', passed: 5, total: 5, results: [], cached: true, cacheKey: '3fa2' })).toEqual({
    text: '5/5 test đạt',
    tone: 'ok',
    cache: { hit: true, label: 'CACHE HIT (3fa2…)' },
  });
});

test('run_tests trượt → liệt kê test trượt, tone warn, MISS kèm thời gian', () => {
  const out = summarizeToolOutput('run_tests', {
    status: 'ok', passed: 4, total: 5, cached: false, durationMs: 812,
    results: [{ name: 'mảng rỗng', ok: false }, { name: 'số dương', ok: true }],
  });
  expect(out).toEqual({ text: '4/5 test đạt · trượt: mảng rỗng', tone: 'warn', cache: { hit: false, label: 'MISS · 812ms' } });
});

test('run_tests timeout và load_error → tone error', () => {
  expect(summarizeToolOutput('run_tests', { status: 'timeout', timeoutMs: 3000, cached: false, durationMs: 3010 }).text).toBe('TIMEOUT 3s');
  expect(summarizeToolOutput('run_tests', { status: 'load_error', message: 'SyntaxError', cached: true, cacheKey: 'ab12' })).toMatchObject({
    text: 'LOAD_ERROR: SyntaxError',
    tone: 'error',
  });
});

test('tool khác → JSON rút gọn ≤ 200 ký tự', () => {
  const out = summarizeToolOutput('read_file', { content: 'x'.repeat(500) });
  expect(out.tone).toBe('ok');
  expect(out.text.length).toBeLessThanOrEqual(200);
  expect(out.text.endsWith('…')).toBe(true);
});
