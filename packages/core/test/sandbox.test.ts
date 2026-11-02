import { expect, test } from 'vitest';
import { runSubmission } from '../src/sandbox.js';

const T = 'data/assignments/sum-array/tests.js';
const S = (name: string) => `data/submissions/sum-array/${name}.js`;

test('nam đạt 5/5', async () => {
  expect(await runSubmission(S('nam'), T)).toMatchObject({ status: 'ok', passed: 5, total: 5 });
});

test('lan trượt đúng test mảng rỗng', async () => {
  const r = await runSubmission(S('lan'), T);
  expect(r).toMatchObject({ status: 'ok', passed: 4 });
  expect(r.status === 'ok' && r.results.find((x) => !x.ok)?.name).toBe('mảng rỗng');
});

test('hung bị timeout', async () => {
  expect(await runSubmission(S('hung'), T, 1000)).toEqual({ status: 'timeout', timeoutMs: 1000 });
}, 5000);

test('minh lỗi cú pháp: báo dòng lỗi theo đường dẫn trong bài nộp, không lộ đường dẫn tuyệt đối của máy chủ', async () => {
  const r = await runSubmission(S('minh'), T);
  expect(r).toMatchObject({ status: 'load_error' });
  const message = r.status === 'load_error' ? r.message : '';
  expect(message).toMatch(/^minh\.js:10/);
  expect(message).not.toMatch(/[A-Za-z]:\|\/code\/|harness/);
});

test('console.log trong bài không làm hỏng kết quả', async () => {
  expect(await runSubmission('packages/core/test/fixtures/noisy.js', T)).toMatchObject({ status: 'ok', passed: 5 });
});

test('process.exit trả load_error có mã thoát', async () => {
  const r = await runSubmission('packages/core/test/fixtures/exits.js', T);
  expect(r.status).toBe('load_error');
  expect(r.status === 'load_error' && r.message).toContain('3');
});

test('bài đúng nhưng còn timer chạy nền vẫn được chấm ok, không bị coi là timeout', async () => {
  expect(await runSubmission('packages/core/test/fixtures/lingering.js', T, 1500)).toMatchObject({ status: 'ok', passed: 5 });
}, 5000);

const F = 'packages/core/test/fixtures';

test('bài nộp bị cô lập: không đọc file ngoài, không ghi file, không chạy lệnh, không thấy biến môi trường', async () => {
  process.env.HARNESS_SECRET_PROBE = 'lo-ra-ngoai';
  try {
    const r = await runSubmission(`${F}/probe/index.js`, `${F}/probe-tests.js`, 5000);
    expect(r).toMatchObject({ status: 'ok', total: 5 });
    expect(r.status === 'ok' && r.results.filter((x) => !x.ok)).toEqual([]);
  } finally {
    delete process.env.HARNESS_SECRET_PROBE;
  }
}, 10000);

test('bài nộp xả quá nhiều dữ liệu ra stdout → dừng, báo load_error', async () => {
  const r = await runSubmission(`${F}/flood.js`, T, 5000);
  expect(r.status).toBe('load_error');
  expect(r.status === 'load_error' && r.message).toMatch(/quá nhiều/);
}, 10000);

test('bài nhiều file: file chính require file khác trong cùng thư mục bài nộp', async () => {
  expect(await runSubmission(`${F}/multi/index.js`, T)).toMatchObject({ status: 'ok', passed: 5, total: 5 });
});
