import { wrapLanguageModel, type LanguageModel } from 'ai';
import { quotaDay } from './quota.js';
import { is429, isDailyQuota } from './rateLimit.js';

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]['model'];
type V4Model = ReturnType<typeof wrapLanguageModel>;

export type FallbackOptions = {
  /** Báo cho người dùng biết harness vừa chuyển sang model dự phòng và vì sao. */
  onFallback?: (reason: string) => void;
  now?: () => Date;
};

// Model chính bị giới hạn (429 sau khi đã tự chờ) → gọi lại đúng lượt đó bằng model dự phòng, agent loop chạy tiếp.
// Hết quota NGÀY thì dùng luôn model dự phòng tới hết ngày quota (khỏi tốn một lần gọi hỏng mỗi lượt).
// Lượt do model dự phòng trả lời được gắn providerMetadata.harness = { fallback, model } để log ghi rõ.
export function withFallback(primary: LanguageModel, backup: LanguageModel, o: FallbackOptions = {}): V4Model {
  const now = o.now ?? (() => new Date());
  const backupModel = backup as V4Model;
  let dailyExhausted: string | null = null;
  return wrapLanguageModel({
    model: primary as WrappableModel,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async ({ doGenerate, params }) => {
        const viaBackup = async () => {
          const r = await backupModel.doGenerate(params);
          return { ...r, providerMetadata: { ...r.providerMetadata, harness: { fallback: true, model: backupModel.modelId } } };
        };
        if (dailyExhausted === quotaDay(now())) return viaBackup();
        try {
          return await doGenerate();
        } catch (e) {
          if (!is429(e)) throw e;
          const daily = isDailyQuota(e);
          if (daily) dailyExhausted = quotaDay(now());
          o.onFallback?.(daily ? 'Gemini đã hết quota miễn phí trong ngày' : 'Gemini vẫn giới hạn tốc độ sau khi đã chờ');
          return viaBackup();
        }
      },
    },
  });
}
