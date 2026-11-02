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

test('minh lỗi cú pháp', async () => {
  expect(await runSubmission(S('minh'), T)).toMatchObject({ status: 'load_error' });
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
