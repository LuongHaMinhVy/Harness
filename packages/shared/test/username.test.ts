import { expect, test } from 'vitest';
import { UsernameSchema } from '../src/api.js';

// Tên đăng nhập dùng làm tên thư mục bài nộp: "..", "." hay tên kết thúc bằng dấu chấm (Windows bỏ dấu chấm cuối)
// sẽ khiến bài nộp ra ngoài thư mục đề hoặc trùng thư mục của người khác.
test('tên đăng nhập phải bắt đầu và kết thúc bằng chữ/số', () => {
  for (const ok of ['nam', 'gv.demo', 'nguyen_van-a', 'a1', 'Hung2']) expect(UsernameSchema.safeParse(ok).success).toBe(true);
  for (const bad of ['..', '.', '...', 'nam.', '.nam', '-a', 'a_', 'a b', 'nam/x', 'năm']) expect(UsernameSchema.safeParse(bad).success, bad).toBe(false);
});

test('tên đăng nhập có thể là email (vd. admin tạo từ ADMIN_EMAIL)', () => {
  for (const ok of ['admin@truong.edu.vn', 'gv.lan@gmail.com', 'a+b@x.io']) expect(UsernameSchema.safeParse(ok).success, ok).toBe(true);
  for (const bad of ['a@', '@x.com', 'a@b', 'a@@b.com', 'a b@x.com']) expect(UsernameSchema.safeParse(bad).success, bad).toBe(false);
});
