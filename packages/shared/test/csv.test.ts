import { expect, test } from 'vitest';
import { parseStudentCsv } from '../src/csv.js';

test('đọc dòng "username,họ tên", bỏ dòng tiêu đề và dòng trống', () => {
  const csv = 'username,fullName\nnam,Nguyễn Văn Nam\n\nlan, Trần Thị Lan \n';
  expect(parseStudentCsv(csv)).toEqual({
    rows: [
      { username: 'nam', fullName: 'Nguyễn Văn Nam' },
      { username: 'lan', fullName: 'Trần Thị Lan' },
    ],
    errors: [],
  });
});

test('nhận dấu ; hoặc tab, ngoặc kép có dấu phẩy bên trong, BOM của Excel', () => {
  const csv = '﻿an;"Lê, Văn An"\nhung\tPhạm Hùng';
  expect(parseStudentCsv(csv).rows).toEqual([
    { username: 'an', fullName: 'Lê, Văn An' },
    { username: 'hung', fullName: 'Phạm Hùng' },
  ]);
});

test('dòng thiếu cột hoặc tên đăng nhập sai định dạng → báo lỗi theo số dòng, không bỏ qua im lặng', () => {
  const r = parseStudentCsv('nam,Nam\nchi-co-mot-cot\nlê văn,Tên có dấu\nnam,Trùng');
  expect(r.rows).toEqual([{ username: 'nam', fullName: 'Nam' }]);
  expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
});
