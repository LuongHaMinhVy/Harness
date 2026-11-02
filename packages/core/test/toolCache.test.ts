import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createTestCache } from '../src/toolCache.js';
import type { RunResult } from '../src/sandbox.js';

const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'cache-')), 'sub', 'tests.json');
const ok: RunResult = { status: 'ok', passed: 5, total: 5, results: [] };

test('cùng nội dung → cùng key; đổi 1 ký tự bài nộp → key khác', () => {
  const cache = createTestCache(tmpFile());
  expect(cache.key('a', 't')).toBe(cache.key('a', 't'));
  expect(cache.key('a', 't')).not.toBe(cache.key('b', 't'));
  expect(cache.key('a', 't')).toMatch(/^[0-9a-f]{64}$/);
});

test('set rồi get trả lại đúng kết quả', () => {
  const cache = createTestCache(tmpFile());
  const k = cache.key('a', 't');
  expect(cache.get(k)).toBeUndefined();
  cache.set(k, ok);
  expect(cache.get(k)).toEqual(ok);
});

test('instance mới đọc lại từ file', () => {
  const file = tmpFile();
  const first = createTestCache(file);
  const k = first.key('a', 't');
  first.set(k, ok);
  expect(createTestCache(file).get(k)).toEqual(ok);
});

test('file JSON hỏng → cache rỗng, không ném lỗi', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cache-'));
  const file = join(dir, 'tests.json');
  writeFileSync(file, '{không phải json');
  const cache = createTestCache(file);
  expect(cache.get(cache.key('a', 't'))).toBeUndefined();
});
