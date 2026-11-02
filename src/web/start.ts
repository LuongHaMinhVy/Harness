import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import type { LanguageModel } from 'ai';
import { createApp } from './server.js';
import { createWebSession } from './webSession.js';

const STATIC_ROOT = 'web/dist';

// Khởi động server web, dùng chung cho chạy thật (main.ts) và chạy với model giả (scripts/web-mock.ts).
export function startWebServer(o: { model: LanguageModel; modelName: string; maxSteps: number; port: number; dev: boolean }) {
  const session = createWebSession({
    model: o.model,
    modelName: o.modelName,
    dataDir: 'data',
    gradesFile: 'data/grades.json',
    evalGradesFile: 'data/grades-eval.json',
    cacheFile: '.cache/tests.json',
    logDir: 'logs',
    goldenFile: 'eval/golden.json',
    maxSteps: o.maxSteps,
  });
  const hasUi = existsSync(STATIC_ROOT);
  const app = createApp({ session, port: o.port, dev: o.dev, staticRoot: hasUi ? STATIC_ROOT : undefined });

  // Chỉ lắng nghe 127.0.0.1: máy khác trong mạng không truy cập được.
  serve({ fetch: app.fetch, hostname: '127.0.0.1', port: o.port }, () => {
    console.log(`Trợ lý chấm bài (web) đang chạy tại http://127.0.0.1:${o.port}  ·  model: ${o.modelName}`);
    if (o.dev) console.log('Chế độ dev: mở giao diện Vite tại http://localhost:5173');
    else if (!hasUi) console.log('Chưa có giao diện đã build — chạy `pnpm web` (tự build) thay vì gọi trực tiếp file này.');
  });
}

export function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 3000;
}

export function parseMaxSteps(value: string | undefined): number {
  const n = Number(value ?? 6);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : 6;
}
