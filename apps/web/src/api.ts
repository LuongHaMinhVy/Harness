// Gọi API của server. Trình duyệt tự gửi header Origin cho POST, server dùng nó để chống CSRF.
import type { EventEnvelope, GradeRecord, StateSnapshot } from '@harness/shared/events';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Lỗi HTTP ${res.status}`);
  return body as T;
}

const post = (path: string, body: unknown = {}) =>
  request<{ ok: true }>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  grades: () => request<GradeRecord[]>('/api/grades'),
  ask: (question: string) => post('/api/ask', { question }),
  approve: (id: string, approved: boolean) => post('/api/approve', { id, approved }),
  settings: (maxSteps: number) => post('/api/settings', { maxSteps }),
  reset: () => post('/api/reset'),
  runEval: () => post('/api/eval'),
};

// EventSource tự kết nối lại khi mất kết nối. Mỗi kết nối (kể cả kết nối lại) nhận snapshot làm khung đầu tiên,
// rồi mới đến các sự kiện mới hơn — cùng một luồng nên không thể lệch thứ tự hay mất sự kiện.
export function connectEvents(h: {
  onOpen: () => void;
  onError: () => void;
  onSnapshot: (snap: StateSnapshot) => void;
  onEnvelope: (env: EventEnvelope) => void;
}): () => void {
  const source = new EventSource('/api/events');
  source.onopen = h.onOpen;
  source.onerror = h.onError;
  source.addEventListener('snapshot', (m) => h.onSnapshot(JSON.parse(m.data) as StateSnapshot));
  source.onmessage = (m) => h.onEnvelope(JSON.parse(m.data) as EventEnvelope);
  return () => source.close();
}
