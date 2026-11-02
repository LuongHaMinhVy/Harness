import type { StepLog, Usage } from '@harness/shared/types';

// Giá trả phí (USD / 1M token) để quy đổi chi phí trong log — free tier thực trả $0.
// Gemini 2.5 Flash: https://ai.google.dev/gemini-api/docs/pricing · Groq gpt-oss-120b: https://console.groq.com/docs/model/openai/gpt-oss-120b
export type Prices = { model: string; inputPerM: number; cachedPerM: number; outputPerM: number; checkedAt: string };

export const PRICES: Prices = { model: 'gemini-2.5-flash', inputPerM: 0.3, cachedPerM: 0.03, outputPerM: 2.5, checkedAt: '2026-11-02' };

const TABLE: Record<string, Prices> = {
  [PRICES.model]: PRICES,
  'openai/gpt-oss-120b': { model: 'openai/gpt-oss-120b', inputPerM: 0.15, cachedPerM: 0.075, outputPerM: 0.6, checkedAt: '2026-11-02' },
};

/** Giá của model trả lời lượt đó; model chưa có trong bảng thì dùng giá Gemini 2.5 Flash. */
export function pricesFor(model: string | undefined): Prices {
  return (model && TABLE[model]) || PRICES;
}

export type { Usage };

export function costUsd(u: Usage, prices: Prices = PRICES): number {
  const cached = u.cached ?? 0;
  return ((u.input - cached) * prices.inputPerM + cached * prices.cachedPerM + u.output * prices.outputPerM) / 1e6;
}

/** Chi phí cả câu hỏi: mỗi lượt tính theo giá của đúng model đã trả lời lượt đó (Gemini hoặc Groq dự phòng). */
export function stepsCost(steps: StepLog[]): number {
  return steps.reduce((a, s) => a + costUsd(s.usage, pricesFor(s.model)), 0);
}
