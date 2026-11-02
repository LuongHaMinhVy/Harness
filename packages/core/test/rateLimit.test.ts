import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { expect, test } from 'vitest';
import { retryDelayMs, withRateLimitRetry } from '../src/rateLimit.js';

// Lỗi 429 đúng dạng Gemini trả về: RetryInfo.retryDelay + QuotaFailure cho biết quota theo phút hay theo ngày.
const gemini429 = (retryDelay: string, quotaId = 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier') =>
  new APICallError({
    message: `You exceeded your current quota. Please retry in ${retryDelay}.`,
    url: 'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent',
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
    responseBody: JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        details: [
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
        ],
      },
    }),
  });

const ok = {
  content: [{ type: 'text' as const, text: 'xong' }],
  finishReason: { unified: 'stop' as const, raw: 'STOP' },
  usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
  warnings: [],
};

function setup(errors: unknown[]) {
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      const e = errors.shift();
      if (e) throw e;
      return ok;
    },
  });
  const waits: number[] = [];
  const notes: string[] = [];
  const wrapped = withRateLimitRetry(model, {
    sleep: async (ms) => void waits.push(ms),
    onWait: (ms, attempt) => notes.push(`${ms}:${attempt}`),
  });
  const call = () => wrapped.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] });
  return { model, call, waits, notes };
}

test('retryDelayMs đọc RetryInfo ("27s", "1.5s"), không có thì đọc "retry in Xs" trong message', () => {
  expect(retryDelayMs(gemini429('27s'))).toBe(27_000);
  expect(retryDelayMs(gemini429('1.5s'))).toBe(1_500);
  expect(retryDelayMs(new APICallError({ message: 'Please retry in 12.3s.', url: 'x', requestBodyValues: {}, statusCode: 429 }))).toBe(12_300);
  expect(retryDelayMs(new Error('khác'))).toBeNull();
});

test('429 theo phút → đợi đúng thời gian Gemini yêu cầu (+1s đệm) rồi gọi lại, báo cho người dùng', async () => {
  const { call, waits, notes, model } = setup([gemini429('27s'), gemini429('3s')]);
  const r = await call();
  expect(r.content).toEqual(ok.content);
  expect(waits).toEqual([28_000, 4_000]);
  expect(notes).toEqual(['28000:1', '4000:2']);
  expect(model.doGenerateCalls).toHaveLength(3);
});

test('hết quota trong ngày → không chờ, ném lỗi ngay', async () => {
  const { call, waits } = setup([gemini429('3600s', 'GenerateRequestsPerDayPerProjectPerModel-FreeTier')]);
  await expect(call()).rejects.toThrow(/quota/);
  expect(waits).toEqual([]);
});

test('thời gian chờ quá 60s hoặc thử quá 3 lần → ném lỗi, không treo mãi', async () => {
  await expect(setup([gemini429('90s')]).call()).rejects.toThrow();
  const many = setup([gemini429('1s'), gemini429('1s'), gemini429('1s'), gemini429('1s')]);
  await expect(many.call()).rejects.toThrow();
  expect(many.waits).toHaveLength(3);
});

test('lỗi khác 429 → ném ngay, không chờ', async () => {
  const { call, waits } = setup([new APICallError({ message: 'API key not valid', url: 'x', requestBodyValues: {}, statusCode: 400 })]);
  await expect(call()).rejects.toThrow(/API key/);
  expect(waits).toEqual([]);
});

test('retryDelayMs đọc kiểu Groq: header retry-after, hoặc "Please try again in 7.66s"', () => {
  const groq = (message: string, headers?: Record<string, string>) =>
    new APICallError({ message, url: 'https://api.groq.com/openai/v1/chat/completions', requestBodyValues: {}, statusCode: 429, responseHeaders: headers });
  expect(retryDelayMs(groq('Rate limit reached', { 'retry-after': '12' }))).toBe(12_000);
  expect(retryDelayMs(groq('Rate limit reached for model on tokens per minute (TPM). Please try again in 7.66s.'))).toBe(7_660);
});
