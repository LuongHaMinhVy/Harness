import { expect, test } from 'vitest';
import { createServerApp } from '../src/app.js';
import { parseNetworkConfig } from '../src/network.js';
import { createTestServer } from './helpers.js';

test('mặc định chỉ chạy trên máy (127.0.0.1), không HTTPS', () => {
  expect(parseNetworkConfig({}, [], () => ['192.168.1.10'])).toEqual({ host: '127.0.0.1', allowedHosts: [], tls: null });
});

test('--lan: lắng nghe mọi địa chỉ, tự nhận IPv4 của máy làm host hợp lệ; ALLOWED_HOSTS được cộng thêm', () => {
  expect(parseNetworkConfig({ ALLOWED_HOSTS: 'cham-bai.lan, 10.0.0.5' }, ['--lan'], () => ['192.168.1.10'])).toEqual({
    host: '0.0.0.0',
    allowedHosts: ['192.168.1.10', 'cham-bai.lan', '10.0.0.5'],
    tls: null,
  });
});

test('TLS_CERT + TLS_KEY → bật HTTPS; thiếu một trong hai → lỗi rõ ràng', () => {
  expect(parseNetworkConfig({ TLS_CERT: 'c.pem', TLS_KEY: 'k.pem' }, [], () => []).tls).toEqual({ cert: 'c.pem', key: 'k.pem' });
  expect(() => parseNetworkConfig({ TLS_CERT: 'c.pem' }, [], () => [])).toThrow(/TLS_KEY/);
});

test('ALLOWED_HOSTS có giá trị lạ (dấu cách, giao thức, cổng) → lỗi rõ ràng', () => {
  expect(() => parseNetworkConfig({ ALLOWED_HOSTS: 'http://x.lan' }, ['--lan'], () => [])).toThrow(/ALLOWED_HOSTS/);
});

test('mở LAN: host trong danh sách được nhận, host lạ vẫn 403; HTTPS thì Origin phải là https', async () => {
  const s = await createTestServer();
  const lan = createServerApp(s.ctx, { port: 3000, allowedHosts: ['192.168.1.10'], https: true });
  expect((await lan.request('https://192.168.1.10:3000/api/auth/me')).status).toBe(401);
  expect((await lan.request('https://evil.lan:3000/api/auth/me')).status).toBe(403);
  const post = (origin: string) =>
    lan.request('https://192.168.1.10:3000/api/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nam', password: 'mat-khau-123' }),
    });
  expect((await post('http://192.168.1.10:3000')).status).toBe(403);
  const ok = await post('https://192.168.1.10:3000');
  expect(ok.status).toBe(200);
});
