import { expect, test } from 'vitest';
import { UsernameSchema } from '../src/api.js';

// Tên đăng nhập dùng làm tên thư mục bài nộp: "..", "." hay tên kết thúc bằng dấu chấm (Windows bỏ dấu chấm cuối)
// sẽ khiến bài nộp ra ngoài thư mục đề hoặc trùng thư mục của người khác.
test('tên đăng nhập phải bắt đầu và kết thúc bằng chữ/số', () => {
  for (const ok of ['nam', 'gv.demo', 'nguyen_van-a', 'a1', 'Hung2']) expect(UsernameSchema.safeParse(ok).success).toBe(true);
  for (const bad of ['..', '.', '...', 'nam.', '.nam', '-a', 'a_', 'a b', 'nam/x', 'năm']) expect(UsernameSchema.safeParse(bad).success, bad).toBe(false);
});
