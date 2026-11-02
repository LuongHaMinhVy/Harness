import { existsSync, readFileSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { serve } from '@hono/node-server';
import type { AppPaths } from '@harness/core/config';
import type { LanguageModel } from 'ai';
import { createAppContext, createServerApp, type AppContext } from './app.js';
import { openDatabase } from './db/database.js';
import type { NetworkConfig } from './network.js';
import { createWebSession } from './webSession.js';

const STATIC_ROOT = 'apps/web/dist';

export type StartOptions = {
  model: LanguageModel;
  modelName: string;
  paths: AppPaths;
  maxSteps: number;
  port: number;
  dev: boolean;
  network: NetworkConfig;
  /** Chạy trước khi mở cổng (vd. tạo dữ liệu demo cho chế độ model giả). */
  prepare?: (ctx: AppContext) => Promise<void>;
};

// Khởi động web lớp học: database SQLite, phiên Harness cho admin, giao diện đã build, HTTP hoặc HTTPS.
export async function startWebServer(o: StartOptions): Promise<void> {
  const db = openDatabase(o.paths.dbFile ?? 'data/app.db');
  const harness = createWebSession({ model: o.model, modelName: o.modelName, ...o.paths, maxSteps: o.maxSteps });
  const ctx = createAppContext(db, { paths: o.paths, model: o.model, modelName: o.modelName, maxSteps: o.maxSteps, harness });
  // Chỉ server mới làm việc này (không phải lệnh CLI như admin:create chạy song song): lần chấm còn dở từ lần chạy
  // trước coi như lỗi để chấm lại được.
  ctx.gradings.failInterrupted();
  const purge = () => {
    ctx.sessions.purgeExpired();
    ctx.loginLimiter.purge();
    ctx.ipLimiter.purge();
  };
  purge();
  setInterval(purge, 60 * 60_000).unref();
  await o.prepare?.(ctx);

  const hasUi = existsSync(STATIC_ROOT);
  const https = !!o.network.tls;
  const app = createServerApp(ctx, {
    port: o.port,
    dev: o.dev,
    allowedHosts: o.network.allowedHosts,
    https,
    staticRoot: hasUi ? STATIC_ROOT : undefined,
  });

  const scheme = https ? 'https' : 'http';
  const tls = o.network.tls;
  serve(
    {
      fetch: app.fetch,
      hostname: o.network.host,
      port: o.port,
      ...(tls ? { createServer: createHttpsServer, serverOptions: { cert: readFileSync(tls.cert), key: readFileSync(tls.key) } } : {}),
    },
    () => {
      console.log(`Trợ lý chấm bài đang chạy tại ${scheme}://127.0.0.1:${o.port}  ·  model: ${o.modelName}`);
      if (o.network.host !== '127.0.0.1') {
        for (const h of o.network.allowedHosts) console.log(`  Trong mạng LAN: ${scheme}://${h}:${o.port}`);
        if (!https) console.warn('⚠ Đang mở LAN bằng HTTP: mật khẩu truyền không mã hoá. Nên đặt TLS_CERT/TLS_KEY để bật HTTPS.');
      }
      if (o.dev) console.log('Chế độ dev: mở giao diện Vite tại http://localhost:5173');
      else if (!hasUi) console.log('Chưa có giao diện đã build — chạy `pnpm web` (tự build) thay vì gọi trực tiếp file này.');
      if (!ctx.users.countByRole('admin')) console.log('Chưa có tài khoản admin — tạo bằng: pnpm admin:create <tên-đăng-nhập> "<Họ tên>"');
    },
  );
}

export function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 3000;
}

export function parseMaxSteps(value: string | undefined): number {
  const n = Number(value ?? 8);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : 8;
}
