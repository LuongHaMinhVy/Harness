import { ApproveBody, AskBody, SettingsBody, type EventEnvelope } from '@harness/shared/events';
import { Hono } from 'hono';
import { requireAuth, requireRole, type AppEnv } from '../auth/middleware.js';
import type { WebSession } from '../webSession.js';
import { parseJson } from './parse.js';
import { sseStream } from './sse.js';

const BUSY = { error: 'Đang chạy một việc khác' } as const;

// Trang Harness của admin: hỏi trợ lý tự do, log từng lượt, duyệt điểm, bộ đánh giá — như bản CLI.
export function harnessRoutes(session: WebSession) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth(), requireRole('admin'));

  app.get('/state', (c) => c.json(session.snapshot()));
  app.get('/grades', (c) => c.json(session.grades()));

  // Khung đầu là snapshot, lấy cùng tick với subscribe nên giao diện không mất sự kiện khi tải lại trang.
  app.get('/events', (c) =>
    sseStream(c, {
      first: { event: 'snapshot', data: session.snapshot() },
      subscribe: (send) => session.subscribe((event, seq) => send({ seq, event } satisfies EventEnvelope)),
    }),
  );

  app.post('/ask', async (c) => {
    const body = await parseJson(c, AskBody);
    if (body instanceof Response) return body;
    return session.ask(body.question) === 'busy' ? c.json(BUSY, 409) : c.json({ ok: true }, 202);
  });

  app.post('/approve', async (c) => {
    const body = await parseJson(c, ApproveBody);
    if (body instanceof Response) return body;
    return session.approve(body.id, body.approved) ? c.json({ ok: true }) : c.json({ error: 'Yêu cầu duyệt không còn chờ' }, 404);
  });

  app.post('/settings', async (c) => {
    const body = await parseJson(c, SettingsBody);
    if (body instanceof Response) return body;
    session.setMaxSteps(body.maxSteps);
    return c.json({ ok: true });
  });

  app.post('/reset', (c) => (session.reset() ? c.json({ ok: true }) : c.json(BUSY, 409)));
  app.post('/eval', (c) => (session.runEval() === 'busy' ? c.json(BUSY, 409) : c.json({ ok: true }, 202)));

  return app;
}
