import { expect, test } from 'vitest';
import { costUsd } from '../src/pricing.js';

const prices = { model: 'giả', inputPerM: 1, cachedPerM: 0.25, outputPerM: 4, checkedAt: '2026-11-02' };

test('costUsd tính phần cache theo giá cache', () => {
  expect(costUsd({ input: 1e6, cached: 5e5, output: 1e6 }, prices)).toBeCloseTo(4.625);
});

test('costUsd cached null coi như 0', () => {
  expect(costUsd({ input: 1e6, cached: null, output: 0 }, prices)).toBeCloseTo(1);
});
