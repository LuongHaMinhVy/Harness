// Giá trả phí của Gemini 2.5 Flash (USD / 1M token), tra tại https://ai.google.dev/gemini-api/docs/pricing.
// Free tier thực trả $0 — số này chỉ để quy đổi chi phí trong log.
export const PRICES = {
  model: 'gemini-2.5-flash',
  inputPerM: 0.3,
  cachedPerM: 0.03,
  outputPerM: 2.5,
  checkedAt: '2026-11-02',
};

export type Prices = typeof PRICES;
export type Usage = { input: number; cached: number | null; output: number };

export function costUsd(u: Usage, prices: Prices = PRICES): number {
  const cached = u.cached ?? 0;
  return ((u.input - cached) * prices.inputPerM + cached * prices.cachedPerM + u.output * prices.outputPerM) / 1e6;
}
