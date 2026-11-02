import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockLanguageModelV4 } from 'ai/test';
import { expect, test } from 'vitest';
import { countCalls, createQuotaCounter, quotaDay } from '../src/quota.js';

test('quotaDay theo giờ Thái Bình Dương (Google reset quota lúc 0h PT ≈ 15h giờ VN mùa đông)', () => {
  expect(quotaDay(new Date('2026-11-02T07:59:00Z'))).toBe('2026-11-01'); // 14:59 giờ VN
  expect(quotaDay(new Date('2026-11-02T08:00:00Z'))).toBe('2026-11-02'); // 15:00 giờ VN
});

test('đếm lần gọi trong ngày, lưu file, sang ngày quota mới thì về 0', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'quota-')), 'quota.json');
  let now = new Date('2026-11-02T09:00:00Z');
  const q = createQuotaCounter(file, { limit: 20, now: () => now });
  expect(q.used()).toBe(0);
  q.record();
  q.record();
  expect(createQuotaCounter(file, { now: () => now }).used()).toBe(2);
  expect(q.label()).toMatch(/2\/20/);
  now = new Date('2026-11-03T08:30:00Z');
  expect(q.used()).toBe(0);
});

test('countCalls gọi onCall sau mỗi lần gọi model thành công, lỗi thì không đếm', async () => {
  let fail = true;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      if (fail) throw new Error('429');
      return {
        content: [{ type: 'text' as const, text: 'ok' }],
        finishReason: { unified: 'stop' as const, raw: 'STOP' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
        warnings: [],
      };
    },
  });
  let calls = 0;
  const counted = countCalls(model, () => calls++);
  const opts = { prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }] };
  await expect(counted.doGenerate(opts)).rejects.toThrow();
  fail = false;
  await counted.doGenerate(opts);
  expect(calls).toBe(1);
});
