import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';

const HEARTBEAT_MS = 15_000;

// Mở luồng SSE: gửi khung đầu (nếu có), rồi mọi sự kiện mà `subscribe` đẩy vào; ghi tuần tự để giữ thứ tự,
// gỡ đăng ký khi trình duyệt ngắt kết nối (cả qua abort của stream lẫn signal của request).
export function sseStream(
  c: Context,
  opts: { first?: { event: string; data: unknown }; subscribe: (send: (data: unknown) => void) => () => void },
) {
  return streamSSE(c, async (stream) => {
    let closed = false;
    let queue: Promise<void> = Promise.resolve();
    const write = (message: { event?: string; data: string }) => {
      queue = queue.then(() => (closed ? undefined : stream.writeSSE(message))).catch(() => {});
    };
    if (opts.first) write({ event: opts.first.event, data: JSON.stringify(opts.first.data) });
    const unsubscribe = opts.subscribe((data) => write({ data: JSON.stringify(data) }));
    const close = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
    };
    stream.onAbort(close);
    c.req.raw.signal.addEventListener('abort', close);
    while (!closed && !stream.aborted) {
      await stream.sleep(HEARTBEAT_MS);
      write({ event: 'ping', data: '' });
    }
    close();
  });
}
