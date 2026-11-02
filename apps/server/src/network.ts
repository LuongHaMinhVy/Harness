import { networkInterfaces } from 'node:os';

export type NetworkConfig = { host: string; allowedHosts: string[]; tls: { cert: string; key: string } | null };

const HOSTNAME = /^[a-zA-Z0-9.-]{1,253}$/;

// Địa chỉ IPv4 của chính máy này (trừ loopback) — khi mở LAN, học viên truy cập qua các địa chỉ này.
export function localIPv4(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

// Mặc định chỉ chạy trên máy (127.0.0.1). Mở cho mạng LAN phải chủ động bật `--lan` (hoặc HOST=0.0.0.0);
// khi đó host hợp lệ = IPv4 của máy + ALLOWED_HOSTS. HTTPS bật khi có cả TLS_CERT và TLS_KEY.
export function parseNetworkConfig(env: Record<string, string | undefined>, argv: string[], ips: () => string[] = localIPv4): NetworkConfig {
  const lan = argv.includes('--lan') || env.HOST === '0.0.0.0';
  const extra = (env.ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  for (const h of extra) {
    if (!HOSTNAME.test(h)) throw new Error(`ALLOWED_HOSTS chỉ nhận tên máy hoặc IP (không kèm http:// hay cổng): "${h}"`);
  }
  const allowedHosts = lan ? [...new Set([...ips(), ...extra])] : extra;
  if (!!env.TLS_CERT !== !!env.TLS_KEY) throw new Error('Cần cả TLS_CERT và TLS_KEY để bật HTTPS');
  return {
    host: lan ? '0.0.0.0' : '127.0.0.1',
    allowedHosts,
    tls: env.TLS_CERT && env.TLS_KEY ? { cert: env.TLS_CERT, key: env.TLS_KEY } : null,
  };
}
