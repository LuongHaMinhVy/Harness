import { describe, expect, test } from 'vitest';
import { buildCredentialsCsv } from '../src/lib/credentialsCsv.js';
import { formatDateTime, formatDuration, formatScore, fromDatetimeLocal, isOverdue, relativeDue, toDatetimeLocal } from '../src/lib/dates.js';
import { buildFileTree } from '../src/lib/fileTree.js';
import { commitUrl, shortSha } from '../src/lib/github.js';
import { auditLabel, gradingStatusLabel } from '../src/lib/labels.js';
import { roleHome } from '../src/lib/roles.js';

describe('dates', () => {
  const ms = new Date(2026, 10, 5, 9, 7).getTime();
  test('formatDateTime theo giờ địa phương', () => {
    expect(formatDateTime(ms)).toBe('05/11/2026 09:07');
  });
  test('datetime-local đi và về', () => {
    expect(toDatetimeLocal(ms)).toBe('2026-11-05T09:07');
    expect(fromDatetimeLocal('2026-11-05T09:07')).toBe(ms);
    expect(toDatetimeLocal(null)).toBe('');
    expect(fromDatetimeLocal('')).toBeNull();
    expect(fromDatetimeLocal('không phải ngày')).toBeNull();
  });
  test('hạn nộp', () => {
    expect(isOverdue(null, ms)).toBe(false);
    expect(isOverdue(ms - 1, ms)).toBe(true);
    expect(relativeDue(ms - 1, ms)).toBe('đã quá hạn');
    expect(relativeDue(ms + 30 * 60_000, ms)).toBe('còn 30 phút');
    expect(relativeDue(ms + 5 * 3_600_000, ms)).toBe('còn 5 giờ');
    expect(relativeDue(ms + 3 * 86_400_000, ms)).toBe('còn 3 ngày');
  });
  test('thời lượng và điểm', () => {
    expect(formatDuration(850)).toBe('850ms');
    expect(formatDuration(12_340)).toBe('12,3 giây');
    expect(formatDuration(125_000)).toBe('2 phút 05 giây');
    expect(formatScore(7.25)).toBe('7,25');
    expect(formatScore(8)).toBe('8');
    expect(formatScore(null)).toBe('—');
  });
});

describe('buildCredentialsCsv', () => {
  test('có BOM, tiêu đề, CRLF, bọc ô có dấu phẩy/ngoặc kép', () => {
    const csv = buildCredentialsCsv([
      { username: 'nam', fullName: 'Nguyễn Văn Nam', tempPassword: 'abcDEF234' },
      { username: 'lan', fullName: 'Trần "Lan", B', tempPassword: 'xyz' },
    ]);
    expect(csv.startsWith('﻿username,fullName,tempPassword\r\n')).toBe(true);
    expect(csv).toContain('nam,Nguyễn Văn Nam,abcDEF234\r\n');
    expect(csv).toContain('lan,"Trần ""Lan"", B",xyz\r\n');
  });
  test('chặn công thức Excel', () => {
    const csv = buildCredentialsCsv([{ username: 'a', fullName: '=HYPERLINK("x")', tempPassword: 'p' }]);
    expect(csv).toContain(`a,"'=HYPERLINK(""x"")",p`);
  });
});

describe('buildFileTree', () => {
  test('thư mục trước, file sau, có độ sâu', () => {
    const rows = buildFileTree(['index.js', 'lib/b.js', 'lib/a.js', 'README.md', 'lib/sub/c.js']);
    expect(rows.map((r) => `${'  '.repeat(r.depth)}${r.kind === 'dir' ? `${r.name}/` : r.name}`)).toEqual([
      'lib/',
      '  sub/',
      '    c.js',
      '  a.js',
      '  b.js',
      'index.js',
      'README.md',
    ]);
    expect(rows.find((r) => r.name === 'c.js')?.path).toBe('lib/sub/c.js');
  });
});

describe('github', () => {
  const sha = '0123456789abcdef0123456789abcdef01234567';
  test('link commit từ link repo hoặc link thư mục', () => {
    expect(commitUrl('https://github.com/nam/bai-1', sha)).toBe(`https://github.com/nam/bai-1/commit/${sha}`);
    expect(commitUrl('https://github.com/nam/bai-1/tree/main/tuan-2', sha)).toBe(`https://github.com/nam/bai-1/commit/${sha}`);
    expect(shortSha(sha)).toBe('0123456');
  });
  test('từ chối dữ liệu lạ', () => {
    expect(commitUrl('javascript:alert(1)', sha)).toBeNull();
    expect(commitUrl('https://github.com.evil.com/a/b', sha)).toBeNull();
    expect(commitUrl('https://github.com/nam/bai', 'not-a-sha')).toBeNull();
    expect(commitUrl(null, sha)).toBeNull();
  });
});

describe('labels / roles', () => {
  test('trạng thái chấm', () => {
    expect(gradingStatusLabel(null).label).toBe('Chưa chấm');
    expect(gradingStatusLabel('queued').label).toBe('Đang chờ');
    expect(gradingStatusLabel('running').label).toBe('Đang chấm');
    expect(gradingStatusLabel('done').label).toBe('Đã chấm');
    expect(gradingStatusLabel('error').tone).toBe('error');
  });
  test('nhãn nhật ký, hành động lạ giữ nguyên', () => {
    expect(auditLabel('grade_approved')).toBe('Duyệt điểm');
    expect(auditLabel('something_new')).toBe('something_new');
  });
  test('trang chủ theo vai trò', () => {
    expect(roleHome('student')).toBe('/hoc-vien');
    expect(roleHome('teacher')).toBe('/giang-vien');
    expect(roleHome('admin')).toBe('/admin');
  });
});

test('mức độ cờ cảnh báo', async () => {
  const { flagTone } = await import('../src/lib/labels.js');
  expect(flagTone('Bài nộp có câu nhắm vào AI chấm bài — kiểm tra kỹ trước khi duyệt')).toBe('error');
  expect(flagTone('Điểm AI (9) cao hơn nhiều so với tỉ lệ test đạt (1/5)')).toBe('error');
  expect(flagTone('AI dùng hết số lượt cho phép — câu trả lời có thể chưa đầy đủ')).toBe('warn');
});
