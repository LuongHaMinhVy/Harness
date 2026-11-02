import { expect, test } from 'vitest';
import { createLoginLimiter } from '../../src/auth/rateLimit.js';
import { memoryDb } from '../helpers.js';

function setup() {
  let now = 0;
  const limiter = createLoginLimiter(memoryDb(), { maxFailures: 5, lockMs: 15 * 60_000, now: () => now });
  return { limiter, tick: (ms: number) => (now += ms) };
}

test('sai 5 lần → khoá; trước đó vẫn được thử; khoá riêng từng tài khoản', () => {
  const { limiter } = setup();
  for (let i = 0; i < 4; i++) limiter.fail('user:nam');
  expect(limiter.isLocked('user:nam')).toBe(false);
  limiter.fail('user:nam');
  expect(limiter.isLocked('user:nam')).toBe(true);
  expect(limiter.isLocked('user:lan')).toBe(false);
});

test('hết 15 phút → mở khoá và đếm lại từ đầu', () => {
  const { limiter, tick } = setup();
  for (let i = 0; i < 5; i++) limiter.fail('user:nam');
  tick(15 * 60_000 + 1);
  expect(limiter.isLocked('user:nam')).toBe(false);
  limiter.fail('user:nam');
  expect(limiter.isLocked('user:nam')).toBe(false);
});

test('đăng nhập đúng → xoá bộ đếm', () => {
  const { limiter } = setup();
  for (let i = 0; i < 4; i++) limiter.fail('user:nam');
  limiter.succeed('user:nam');
  limiter.fail('user:nam');
  expect(limiter.isLocked('user:nam')).toBe(false);
});
