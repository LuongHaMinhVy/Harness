import { expect, test } from 'vitest';
import { costUsd, pricesFor, stepsCost } from '../src/pricing.js';
import type { StepLog } from '../src/logger.js';

const prices = { model: 'giả', inputPerM: 1, cachedPerM: 0.25, outputPerM: 4, checkedAt: '2026-11-02' };

test('costUsd tính phần cache theo giá cache', () => {
  expect(costUsd({ input: 1e6, cached: 5e5, output: 1e6 }, prices)).toBeCloseTo(4.625);
});

test('costUsd cached null coi như 0', () => {
  expect(costUsd({ input: 1e6, cached: null, output: 0 }, prices)).toBeCloseTo(1);
});

test('giá theo model: Gemini 2.5 Flash và Groq gpt-oss-120b; model lạ → giá mặc định (Gemini)', () => {
  expect(pricesFor('gemini-2.5-flash').inputPerM).toBe(0.3);
  expect(pricesFor('openai/gpt-oss-120b')).toMatchObject({ inputPerM: 0.15, cachedPerM: 0.075, outputPerM: 0.6 });
  expect(pricesFor(undefined).model).toBe('gemini-2.5-flash');
});

test('stepsCost cộng chi phí từng lượt theo đúng model của lượt đó', () => {
  const step = (model: string): StepLog => ({ index: 1, toolCalls: [], finishReason: 'stop', usage: { input: 1e6, cached: 0, output: 0 }, ms: 1, model });
  expect(stepsCost([step('gemini-2.5-flash'), step('openai/gpt-oss-120b')])).toBeCloseTo(0.45);
});
