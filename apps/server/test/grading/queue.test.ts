import { expect, test } from 'vitest';
import { createQueue } from '../../src/grading/queue.js';

test('chạy tối đa N việc cùng lúc, đủ mọi việc, lỗi một việc không chặn hàng đợi', async () => {
  const q = createQueue(2);
  let active = 0;
  let maxActive = 0;
  const done: number[] = [];
  for (let i = 0; i < 5; i++) {
    q.push(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      if (i === 1) throw new Error('hỏng');
      done.push(i);
    });
  }
  await q.idle();
  expect(maxActive).toBe(2);
  expect(done.sort()).toEqual([0, 2, 3, 4]);
});

test('idle() khi hàng đợi rỗng trả về ngay', async () => {
  await expect(createQueue(2).idle()).resolves.toBeUndefined();
});
