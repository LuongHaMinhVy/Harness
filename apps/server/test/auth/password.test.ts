import { expect, test } from 'vitest';
import { generateTempPassword, hashPassword, verifyPassword } from '../../src/auth/password.js';

test('hash có dạng scrypt$..., verify đúng/sai', async () => {
  const h = await hashPassword('mat-khau-dai');
  expect(h).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  expect(await verifyPassword('mat-khau-dai', h)).toBe(true);
  expect(await verifyPassword('mat-khau-sai', h)).toBe(false);
});

test('cùng mật khẩu → hash khác nhau (salt ngẫu nhiên)', async () => {
  expect(await hashPassword('abcdefgh')).not.toBe(await hashPassword('abcdefgh'));
});

test('hash hỏng → false, không ném lỗi', async () => {
  expect(await verifyPassword('x', 'khong-phai-hash')).toBe(false);
  expect(await verifyPassword('x', 'scrypt$1$1$1$$')).toBe(false);
});

test('mật khẩu tạm: 12 ký tự, không có ký tự dễ nhầm, mỗi lần khác nhau', () => {
  const a = generateTempPassword();
  expect(a).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{12}$/);
  expect(generateTempPassword()).not.toBe(a);
});
