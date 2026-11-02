import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { expect, test } from 'vitest';
import { withFallback } from '../src/fallback.js';

const quota429 = (quotaId: string) =>
  new APICallError({
    message: 'You exceeded your current quota.',
    url: 'https://generativelanguage.googleapis.com/x',
    requestBodyValues: {},
    statusCode: 429,
    responseBody: JSON.stringify({ error: { details: [{ violations: [{ quotaId }] }] } }),
  });
const DAILY = () => quota429('GenerateRequestsPerDayPerProjectPerModel-FreeTier');
const MINUTE = () => quota429('GenerateRequestsPerMinutePerProjectPerModel-FreeTier');

const reply = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const, raw: 'STOP' },
  usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
  warnings: [],
});

function setup(primaryErrors: unknown[]) {
  const primary = new MockLanguageModelV4({
    modelId: 'gemini-2.5-flash',
    doGenerate: async () => {
      const e = primaryErrors.shift();
      if (e) throw e;
      return reply('gemini');
    },
  });
  const backup = new MockLanguageModelV4({ provider: 'groq', modelId: 'openai/gpt-oss-120b', doGenerate: async () => reply('groq') });
  const notes: string[] = [];
  const model = withFallback(primary, backup, { onFallback: (why) => notes.push(why), now: () => new Date('2026-11-02T10:00:00Z') });
  const call = () => model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] });
  return { primary, backup, model, call, notes };
}

const text = (r: { content: unknown[] }) => (r.content[0] as { text: string }).text;

test('Gemini hết quota ngày → lượt đó chạy bằng Groq, gắn nhãn dự phòng; các lượt sau trong ngày đi thẳng Groq', async () => {
  const { call, primary, backup, notes } = setup([DAILY()]);
  const r = await call();
  expect(text(r)).toBe('groq');
  expect(r.providerMetadata?.harness).toEqual({ fallback: true, model: 'openai/gpt-oss-120b' });
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatch(/quota/i);
  await call();
  expect(primary.doGenerateCalls).toHaveLength(1);
  expect(backup.doGenerateCalls).toHaveLength(2);
});

test('Gemini bị chặn theo phút (đã chờ mà vẫn 429) → lượt đó dùng Groq, lượt sau thử lại Gemini', async () => {
  const { call, primary } = setup([MINUTE()]);
  expect(text(await call())).toBe('groq');
  expect(text(await call())).toBe('gemini');
  expect(primary.doGenerateCalls).toHaveLength(2);
});

test('lỗi khác 429 (sai key, lỗi mạng…) → không chuyển, báo lỗi như cũ', async () => {
  const bad = new APICallError({ message: 'API key not valid', url: 'x', requestBodyValues: {}, statusCode: 400 });
  const { call, backup } = setup([bad]);
  await expect(call()).rejects.toThrow(/API key/);
  expect(backup.doGenerateCalls).toHaveLength(0);
});

test('Gemini bình thường → không gắn nhãn dự phòng', async () => {
  const r = await setup([]).call();
  expect(text(r)).toBe('gemini');
  expect(r.providerMetadata?.harness).toBeUndefined();
});
