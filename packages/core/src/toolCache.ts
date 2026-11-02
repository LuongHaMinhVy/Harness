import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RunResult } from './sandbox.js';

export interface TestCache {
  key(submissionSource: string, testsSource: string): string;
  get(key: string): RunResult | undefined;
  set(key: string, result: RunResult): void;
}

function load(file: string): Record<string, RunResult> {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

// Cache kết quả chạy test, key là sha256(bài nộp + bộ test): sửa bài là cache tự mất hiệu lực.
export function createTestCache(file: string): TestCache {
  const entries = load(file);
  return {
    key: (submission, tests) => createHash('sha256').update(`${submission}\0${tests}`).digest('hex'),
    get: (key) => entries[key],
    set(key, result) {
      entries[key] = result;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(entries, null, 2));
    },
  };
}
