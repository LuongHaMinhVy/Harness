import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt có sẵn trong Node: N=2^15, r=8, p=1, salt 16 byte, khoá 64 byte.
const N = 32768;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const MAX_MEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFC'), salt, KEY_LEN, { ...opts, maxmem: MAX_MEM }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

// So sánh thời gian hằng (timingSafeEqual); hash hỏng → false, không ném lỗi.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (!salt.length || expected.length !== KEY_LEN || ![n, r, p].every((x) => Number.isInteger(x) && x > 0)) return false;
  try {
    const key = await derive(password, salt, { N: n, r, p });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Mật khẩu tạm cho học viên mới: 12 ký tự dễ đọc (bỏ 0/O, 1/l/I).
export function generateTempPassword(length = 12): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(length), (b) => alphabet[b % alphabet.length]).join('');
}
