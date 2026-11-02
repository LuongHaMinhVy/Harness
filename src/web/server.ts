import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { z } from 'zod';
import { ApproveBody, AskBody, SettingsBody, type EventEnvelope } from '../shared/events.js';
import { securityMiddleware } from './security.js';
import type { WebSession } from './webSession.js';

export type AppDeps = { session: WebSession; port: number; dev?: boolean; staticRoot?: string };

const HEARTBEAT_MS = 15_000;

// Đọc và kiểm tra body bằng schema zod; sai thì trả 400 với thông báo ngắn, không lộ chi tiết nội bộ.
async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'Body không phải JSON hợp lệ' }, 400);
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : c.json({ error: 'Dữ liệu gửi lên không hợp lệ' }, 400);
}

export function createApp(d: AppDeps) {
  const app = new Hono();
  const { session } = d;

  app.use('*', ...securityMiddleware({ port: d.port, dev: d.dev }));

  app.get('/api/state', (c) => c.json(session.snapshot()));
  app.get('/api/grades', (c) => c.json(session.grades()));

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = session.subscribe((event, seq) => {
        const envelope: EventEnvelope = { seq, event };
        void stream.writeSSE({ data: JSON.stringify(envelope) });
      });
      stream.onAbort(() => {
        unsubscribe();
      });
      while (!stream.aborted) {
        await stream.sleep(HEARTBEAT_MS);
        if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: '' });
      }
    }),
  );

  app.post('/api/ask', async (c) => {
    const body = await parseBody(c, AskBody);
    if (body instanceof Response) return body;
    if (session.ask(body.question) === 'busy') return c.json({ error: 'Đang chạy một việc khác' }, 409);
    return c.json({ ok: true }, 202);
  });

  app.post('/api/approve', async (c) => {
    const body = await parseBody(c, ApproveBody);
    if (body instanceof Response) return body;
    if (!session.approve(body.id, body.approved)) return c.json({ error: 'Yêu cầu duyệt không còn chờ' }, 404);
    return c.json({ ok: true });
  });

  app.post('/api/settings', async (c) => {
    const body = await parseBody(c, SettingsBody);
    if (body instanceof Response) return body;
    session.setMaxSteps(body.maxSteps);
    return c.json({ ok: true });
  });

  app.post('/api/reset', (c) =>
    session.reset() ? c.json({ ok: true }) : c.json({ error: 'Đang chạy một việc khác' }, 409),
  );

  app.post('/api/eval', (c) =>
    session.runEval() === 'busy' ? c.json({ error: 'Đang chạy một việc khác' }, 409) : c.json({ ok: true }, 202),
  );

  app.all('/api/*', (c) => c.json({ error: 'Không tìm thấy' }, 404));

  if (d.staticRoot) {
    app.use('*', serveStatic({ root: d.staticRoot }));
    app.get('*', serveStatic({ path: join(d.staticRoot, 'index.html') }));
  }

  app.onError((err, c) => {
    console.error('[web] lỗi khi xử lý request:', err);
    return c.json({ error: 'Lỗi nội bộ' }, 500);
  });

  return app;
}
