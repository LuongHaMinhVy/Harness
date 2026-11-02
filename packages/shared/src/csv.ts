// Đọc danh sách học viên dạng CSV "username,họ tên" (dấu phân cách , ; hoặc tab), dùng ở giao diện để xem trước
// và ở server để kiểm tra lại. Dòng lỗi được trả kèm số dòng, không bỏ qua im lặng.
import { UsernameSchema } from './api.js';

export type StudentRow = { username: string; fullName: string };
export type CsvResult = { rows: StudentRow[]; errors: { line: number; message: string }[] };

function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';' || ch === '\t') {
      cells.push(cur);
      cur = '';
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

const HEADER = /^(username|tên đăng nhập|ten dang nhap|tai khoan|tài khoản)$/i;

export function parseStudentCsv(text: string): CsvResult {
  const result: CsvResult = { rows: [], errors: [] };
  const seen = new Set<string>();
  text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const line = index + 1;
      if (!raw.trim()) return;
      const [username = '', fullName = ''] = splitLine(raw);
      if (index === 0 && HEADER.test(username)) return;
      if (!username || !fullName) {
        result.errors.push({ line, message: 'Cần 2 cột: tên đăng nhập, họ tên' });
        return;
      }
      const parsed = UsernameSchema.safeParse(username);
      if (!parsed.success) {
        result.errors.push({ line, message: `Tên đăng nhập "${username}" không hợp lệ` });
        return;
      }
      const key = parsed.data.toLowerCase();
      if (seen.has(key)) {
        result.errors.push({ line, message: `Trùng tên đăng nhập "${username}"` });
        return;
      }
      seen.add(key);
      result.rows.push({ username: parsed.data, fullName: fullName.slice(0, 100) });
    });
  return result;
}
