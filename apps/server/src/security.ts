import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';

const VITE_DEV_PORT = 5173;
const MAX_BODY_BYTES = 16 * 1024;
// Route nộp bài: multipart, tới 2 MB file + phần đầu multipart.
const UPLOAD_BODY_BYTES = 2 * 1024 * 1024 + 64 * 1024;
const UPLOAD_PATH = /^\/api\/student\/assignments\/\d+\/submissions$/;

const json = (error: string, status: 403 | 405 | 413 | 415) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } });

// Các lớp bảo vệ cho server chỉ chạy trên máy:
// - Host phải là localhost/127.0.0.1 đúng cổng (chống DNS rebinding).
// - Request từ website khác (Sec-Fetch-Site: cross-site/same-site) bị chặn, kể cả GET.
// - POST phải có Origin của chính trang và Content-Type JSON (chống CSRF từ website khác);
//   riêng route nộp bài nhận multipart/form-data.
// - Giới hạn kích thước body, header bảo mật + CSP chặn script lạ.
export function securityMiddleware(opts: { port: number; dev?: boolean }): MiddlewareHandler[] {
  const ports = opts.dev ? [opts.port, VITE_DEV_PORT] : [opts.port];
  const hosts = new Set(ports.flatMap((p) => [`127.0.0.1:${p}`, `localhost:${p}`]));
  const origins = new Set([...hosts].map((h) => `http://${h}`));

  const checkRequest: MiddlewareHandler = async (c, next) => {
    if (!hosts.has(new URL(c.req.url).host)) return json('Host không hợp lệ', 403);
    // Trình duyệt hiện đại gắn Sec-Fetch-Site cho mọi request; chặn cả GET/HEAD đến từ website khác.
    const site = c.req.header('sec-fetch-site');
    if (site === 'cross-site' || site === 'same-site') return json('Không nhận request từ website khác', 403);
    // Hono trả lời HEAD bằng handler GET; với SSE, HEAD không bao giờ kích hoạt onAbort nên sẽ rò listener.
    if (c.req.method === 'HEAD' && new URL(c.req.url).pathname.startsWith('/api/')) return json('Không hỗ trợ HEAD', 405);
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      if (!origins.has(c.req.header('origin') ?? '')) return json('Origin không hợp lệ', 403);
      const type = c.req.header('content-type') ?? '';
      const upload = c.req.method === 'POST' && UPLOAD_PATH.test(new URL(c.req.url).pathname);
      if (upload ? !type.startsWith('multipart/form-data') : !type.startsWith('application/json')) {
        return json(upload ? 'Chỉ nhận multipart/form-data' : 'Chỉ nhận application/json', 415);
      }
    }
    await next();
  };

  const tooLarge = () => json('Nội dung gửi lên quá lớn', 413);
  const smallBody = bodyLimit({ maxSize: MAX_BODY_BYTES, onError: tooLarge });
  const uploadBody = bodyLimit({ maxSize: UPLOAD_BODY_BYTES, onError: tooLarge });
  const limitBody: MiddlewareHandler = (c, next) => (UPLOAD_PATH.test(new URL(c.req.url).pathname) ? uploadBody : smallBody)(c, next);

  return [
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    }),
    checkRequest,
    limitBody,
  ];
}
