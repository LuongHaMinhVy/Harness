// Gọi API của server. Trình duyệt tự gửi header Origin cho POST, server dùng nó để chống CSRF.
import type { EventEnvelope, GradeRecord, StateSnapshot } from '../../src/shared/events.js';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Lỗi HTTP ${res.status}`);
  return body as T;
}

const post = (path: string, body: unknown = {}) =>
  request<{ ok: true }>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  state: () => request<StateSnapshot>('/api/state'),
  grades: () => request<GradeRecord[]>('/api/grades'),
  ask: (question: string) => post('/api/ask', { question }),
  approve: (id: string, approved: boolean) => post('/api/approve', { id, approved }),
  settings: (maxSteps: number) => post('/api/settings', { maxSteps }),
  reset: () => post('/api/reset'),
  runEval: () => post('/api/eval'),
};

// EventSource tự kết nối lại khi mất kết nối; mỗi lần mở lại, App tải snapshot mới.
export function connectEvents(h: {
  onOpen: () => void;
  onError: () => void;
  onEnvelope: (env: EventEnvelope) => void;
}): () => void {
  const source = new EventSource('/api/events');
  source.onopen = h.onOpen;
  source.onerror = h.onError;
  source.onmessage = (m) => h.onEnvelope(JSON.parse(m.data) as EventEnvelope);
  return () => source.close();
}
