import { google } from '@ai-sdk/google';
import { groq } from '@ai-sdk/groq';
import type { LanguageModel } from 'ai';
import { withFallback } from './fallback.js';
import { countCalls, createQuotaCounter } from './quota.js';
import { withRateLimitRetry } from './rateLimit.js';

// Free tier Groq (bảng giới hạn công bố, đo ngày 2026-11-02): openai/gpt-oss-120b ~1.000 lần gọi/ngày, 30/phút, 8K token/phút.
const GROQ_DAILY_LIMIT = 1000;

export type HarnessModel = { model: LanguageModel; label: string; quotaLabel: () => string };

// Model dùng chung cho CLI, eval và web: Gemini (MODEL, mặc định gemini-2.5-flash) là model chính; nếu .env có
// GROQ_API_KEY thì Groq (GROQ_MODEL, mặc định openai/gpt-oss-120b) là dự phòng khi Gemini bị giới hạn.
// Mỗi model: bị chặn theo phút thì chờ đúng thời gian provider yêu cầu rồi gọi lại; đếm lần gọi theo quota ngày.
export function createHarnessModel(env: Record<string, string | undefined> = process.env, log: (s: string) => void = console.log): HarnessModel {
  const geminiId = env.MODEL ?? 'gemini-2.5-flash';
  const geminiQuota = createQuotaCounter(`.cache/quota-${geminiId}.json`, { name: 'Gemini' });
  const wait = (who: string) => (ms: number) => log(`⏳ ${who} giới hạn tốc độ (free tier) — đợi ${Math.round(ms / 1000)}s rồi gọi lại lượt này…`);
  const gemini = withRateLimitRetry(countCalls(google(geminiId), () => geminiQuota.record()), { onWait: wait('Gemini') });
  if (!env.GROQ_API_KEY) return { model: gemini, label: geminiId, quotaLabel: () => geminiQuota.label() };

  const groqId = env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
  const groqQuota = createQuotaCounter(`.cache/quota-groq-${groqId.replaceAll('/', '_')}.json`, { name: 'Groq', limit: GROQ_DAILY_LIMIT });
  const backup = withRateLimitRetry(countCalls(groq(groqId), () => groqQuota.record()), { onWait: wait('Groq') });
  const model = withFallback(gemini, backup, { onFallback: (why) => log(`↪ ${why} — chuyển lượt này sang Groq (${groqId})`) });
  return { model, label: `${geminiId} · dự phòng Groq ${groqId}`, quotaLabel: () => `${geminiQuota.label()}\n${groqQuota.label()}` };
}
