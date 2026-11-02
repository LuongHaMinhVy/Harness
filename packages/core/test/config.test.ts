import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { APP_PATHS, MOCK_PATHS } from '../src/config.js';

test('chế độ model giả không ghi vào file điểm thật', () => {
  expect(MOCK_PATHS.gradesFile).not.toBe(APP_PATHS.gradesFile);
  expect(MOCK_PATHS.evalGradesFile).not.toBe(APP_PATHS.evalGradesFile);
  expect(MOCK_PATHS.evalGradesFile).not.toBe(APP_PATHS.gradesFile);
});

test('file điểm (thật và giả) đều được gitignore', () => {
  const ignored = readFileSync('.gitignore', 'utf8').split(/\r?\n/);
  for (const f of [APP_PATHS.gradesFile, APP_PATHS.evalGradesFile, MOCK_PATHS.gradesFile, MOCK_PATHS.evalGradesFile]) {
    expect(ignored).toContain(f);
  }
});
