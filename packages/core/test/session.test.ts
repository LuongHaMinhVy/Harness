import { APICallError, RetryError, type ModelMessage } from 'ai';
import { expect, test, vi } from 'vitest';
import type { RunOutcome } from '../src/agent.js';
import { askWithHistory, createSession, describeApiError } from '../src/session.js';

const outcome = (text: string): RunOutcome => ({
  text,
  responseMessages: [{ role: 'assistant', content: text }],
  steps: [],
  hitLimit: false,
  totalMs: 1,
});

function setup(run = vi.fn(async (_h: ModelMessage[], _m: number) => outcome('ok'))) {
  const printed: string[] = [];
  const session = createSession({ run, print: (s) => printed.push(s), maxSteps: 6, costReport: () => 'tổng $0' });
  return { session, run, printed, out: () => printed.join('\n') };
}

const rateLimit = () =>
  new APICallError({ message: 'Resource exhausted', url: 'x', requestBodyValues: {}, statusCode: 429, isRetryable: true });

test('dòng trống không gọi run', async () => {
  const { session, run } = setup();
  expect(await session.handleLine('   ')).toBe('continue');
  expect(run).not.toHaveBeenCalled();
});

test('câu hỏi thành công → history có user + responseMessages', async () => {
  const { session, out } = setup();
  await session.handleLine('Chấm bài của Nam');
  expect(session.history).toEqual([
    { role: 'user', content: 'Chấm bài của Nam' },
    { role: 'assistant', content: 'ok' },
  ]);
  expect(out()).toContain('ok');
});

test('run ném lỗi 429 → history giữ nguyên độ dài cũ, in thông báo rate limit, trả continue', async () => {
  const run = vi.fn().mockResolvedValueOnce(outcome('a')).mockRejectedValueOnce(rateLimit());
  const { session, out } = setup(run);
  await session.handleLine('câu 1');
  const before = session.history.length;
  expect(await session.handleLine('câu 2')).toBe('continue');
  expect(session.history).toHaveLength(before);
  expect(out()).toContain('giới hạn tốc độ');
});

test('câu thứ 2 gửi kèm history của câu 1', async () => {
  const { session, run } = setup();
  await session.handleLine('câu 1');
  await session.handleLine('câu 2');
  const history = run.mock.calls[1][0];
  expect(history.filter((m) => m.role === 'user')).toHaveLength(2);
});

test('/steps 2 → lần run sau nhận maxSteps 2; /steps abc → không đổi', async () => {
  const { session, run } = setup();
  await session.handleLine('/steps 2');
  await session.handleLine('/steps abc');
  await session.handleLine('hỏi');
  expect(run.mock.calls[0][1]).toBe(2);
});

test('/reset xoá history', async () => {
  const { session } = setup();
  await session.handleLine('hỏi');
  await session.handleLine('/reset');
  expect(session.history).toHaveLength(0);
});

test('/cost in costReport', async () => {
  const { session, out } = setup();
  await session.handleLine('/cost');
  expect(out()).toContain('tổng $0');
});

test('/exit → "exit"', async () => {
  const { session } = setup();
  expect(await session.handleLine('/exit')).toBe('exit');
});

test('describeApiError gỡ RetryError ra lỗi 429 bên trong', () => {
  const err = new RetryError({ message: 'Failed after 3 attempts', reason: 'maxRetriesExceeded', errors: [rateLimit(), rateLimit()] });
  expect(describeApiError(err)).toContain('giới hạn tốc độ');
});

test('describeApiError hết quota trong ngày → báo rõ, không bảo "đợi 30s"', () => {
  const err = new APICallError({
    message: 'You exceeded your current quota.',
    url: 'x',
    requestBodyValues: {},
    statusCode: 429,
    responseBody: '{"error":{"details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}',
  });
  expect(describeApiError(err)).toMatch(/trong ngày/);
  expect(describeApiError(err)).not.toMatch(/30s/);
});

test('describeApiError mạng → "Không kết nối được tới Gemini"', () => {
  expect(describeApiError(new TypeError('fetch failed'))).toContain('Không kết nối được tới Gemini');
});

test('describeApiError 401 / thiếu key → nhắc kiểm tra API key', () => {
  const err = new APICallError({ message: 'API key not valid', url: 'x', requestBodyValues: {}, statusCode: 400 });
  expect(describeApiError(err)).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
});

test('askWithHistory thành công → history có user + responseMessages', async () => {
  const history: ModelMessage[] = [];
  const r = await askWithHistory(history, 'hỏi', async () => outcome('đáp'));
  expect(r).toMatchObject({ ok: true });
  expect(history).toEqual([
    { role: 'user', content: 'hỏi' },
    { role: 'assistant', content: 'đáp' },
  ]);
});

test('askWithHistory lỗi → gỡ câu hỏi khỏi history, trả thông báo', async () => {
  const history: ModelMessage[] = [{ role: 'user', content: 'cũ' }];
  const r = await askWithHistory(history, 'mới', () => Promise.reject(rateLimit()));
  expect(r.ok).toBe(false);
  expect(!r.ok && r.message).toContain('giới hạn tốc độ');
  expect(history).toEqual([{ role: 'user', content: 'cũ' }]);
});

test('describeApiError lỗi từ Groq (dự phòng) → nói đúng Groq và GROQ_API_KEY; hết quota ngày của Groq cũng nhận ra', () => {
  const groq = (statusCode: number, message: string) =>
    new APICallError({ message, url: 'https://api.groq.com/openai/v1/chat/completions', requestBodyValues: {}, statusCode });
  expect(describeApiError(groq(401, 'Invalid API Key'))).toContain('GROQ_API_KEY');
  const daily = describeApiError(groq(429, 'Rate limit reached for model openai/gpt-oss-120b on requests per day (RPD): Limit 1000'));
  expect(daily).toMatch(/Groq/);
  expect(daily).toMatch(/trong ngày/);
});
