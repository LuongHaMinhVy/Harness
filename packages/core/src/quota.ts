import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { wrapLanguageModel, type LanguageModel } from 'ai';

// Free tier của gemini-2.5-flash (đo ngày 2026-11-02, lỗi 429 ghi quotaValue "20"): 20 lần gọi model mỗi ngày.
export const FREE_TIER_DAILY_LIMIT = 20;

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]['model'];

/** Ngày tính quota: Google reset quota lúc 0h giờ Thái Bình Dương (≈ 14h–15h giờ Việt Nam). */
export function quotaDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now);
}

// Đếm số lần gọi model trong ngày quota, lưu ra file để CLI, eval và web dùng chung một con số.
// Chỉ là ước tính trên máy này: cùng API key dùng ở nơi khác thì Google vẫn tính, file này không biết.
export function createQuotaCounter(file: string, o: { limit?: number; now?: () => Date; name?: string } = {}) {
  const limit = o.limit ?? FREE_TIER_DAILY_LIMIT;
  const now = o.now ?? (() => new Date());
  const read = (): { day: string; count: number } => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return { day: '', count: 0 };
    }
  };
  const used = () => {
    const r = read();
    return r.day === quotaDay(now()) ? r.count : 0;
  };
  return {
    limit,
    used,
    record(): number {
      const count = used() + 1;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ day: quotaDay(now()), count }));
      return count;
    },
    label(): string {
      return `Quota free tier hôm nay: ${used()}/${limit} lần gọi ${o.name ?? 'Gemini'} (đếm trên máy này)`;
    },
  };
}

export type QuotaCounter = ReturnType<typeof createQuotaCounter>;

/** Gọi onCall sau mỗi lần gọi model thành công (lần bị 429 không tính vào quota). */
export function countCalls(model: LanguageModel, onCall: () => void): ReturnType<typeof wrapLanguageModel> {
  return wrapLanguageModel({
    model: model as WrappableModel,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async ({ doGenerate }) => {
        const result = await doGenerate();
        onCall();
        return result;
      },
    },
  });
}
