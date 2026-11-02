import { expect, test } from 'vitest';
import { buildSystemPrompt, LAST_STEP_NOTE } from '../src/prompt.js';

test('system prompt chứa rubric và không đổi giữa 2 lần gọi', () => {
  const a = buildSystemPrompt('data');
  expect(a).toBe(buildSystemPrompt('data'));
  expect(a).toContain('TypeError');
  expect(a).toContain('sumArray');
});

test('LAST_STEP_NOTE dặn không gọi tool nữa', () => {
  expect(LAST_STEP_NOTE).toContain('Không gọi tool nữa');
});
