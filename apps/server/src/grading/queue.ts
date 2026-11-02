// Hàng đợi giới hạn số việc chạy cùng lúc (chấm bài: tối đa 2 bài, tránh quá tải máy và giới hạn tốc độ của model).
// Lỗi của một việc không chặn các việc khác; việc tự ghi lỗi của mình.
export function createQueue(concurrency: number) {
  const waiting: (() => Promise<void>)[] = [];
  let active = 0;
  let idleWaiters: (() => void)[] = [];

  const pump = () => {
    while (active < concurrency && waiting.length) {
      const task = waiting.shift()!;
      active++;
      task()
        .catch((err) => console.error('[grading] việc trong hàng đợi lỗi:', err))
        .finally(() => {
          active--;
          pump();
        });
    }
    if (active === 0 && !waiting.length) {
      const resolve = idleWaiters;
      idleWaiters = [];
      resolve.forEach((r) => r());
    }
  };

  return {
    push(task: () => Promise<void>): void {
      waiting.push(task);
      queueMicrotask(pump);
    },
    size: () => active + waiting.length,
    idle(): Promise<void> {
      if (active === 0 && !waiting.length) return Promise.resolve();
      return new Promise((r) => idleWaiters.push(r));
    },
  };
}
