// Kênh phát sự kiện trong server (vd. trạng thái chấm) tới các kết nối SSE đang mở.
export function createEventHub<T>() {
  const listeners = new Set<(e: T) => void>();
  return {
    subscribe(fn: (e: T) => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    publish(e: T): void {
      for (const fn of listeners) {
        try {
          fn(e);
        } catch (err) {
          console.error('[events] listener lỗi:', err);
        }
      }
    },
    size: () => listeners.size,
  };
}
