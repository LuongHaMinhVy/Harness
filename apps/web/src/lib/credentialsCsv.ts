// Tạo file CSV danh sách tài khoản + mật khẩu tạm (tải về phía trình duyệt, không gửi đi đâu).

export type CredentialRow = { username: string; fullName: string; tempPassword: string };

// Ô bắt đầu bằng = + - @ (hoặc tab/CR) bị Excel coi là công thức → thêm ' phía trước (chống CSV injection).
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV có BOM UTF-8 (Excel đọc đúng tiếng Việt), xuống dòng CRLF. */
export function buildCredentialsCsv(rows: CredentialRow[]): string {
  const lines = ['username,fullName,tempPassword', ...rows.map((r) => [r.username, r.fullName, r.tempPassword].map(cell).join(','))];
  return `﻿${lines.join('\r\n')}\r\n`;
}
