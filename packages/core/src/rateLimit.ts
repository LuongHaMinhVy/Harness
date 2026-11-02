import { APICallError, wrapLanguageModel, type LanguageModel } from 'ai';

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]['model'];

export type RateLimitOptions = {
  /** Chờ tối đa bao lâu cho một lần (Gemini đòi lâu hơn thì báo lỗi luôn). */
  maxWaitMs?: number;
  /** Số lần chờ-rồi-gọi-lại tối đa cho một lượt. */
  attempts?: number;
  /** Báo cho người dùng biết harness đang chờ (in log, hiện trên web). */
  onWait?: (ms: number, attempt: number) => void;
  sleep?: (ms: number) => Promise<void>;
};

const PAD_MS = 1000;

function body(e: unknown): string {
  return APICallError.isInstance(e) ? (e.responseBody ?? '') : '';
}

export function is429(e: unknown): boolean {
  return APICallError.isInstance(e) && e.statusCode === 429;
}

// Thời gian chờ provider yêu cầu: Gemini ghi trong RetryInfo.retryDelay ("27s") hoặc câu "Please retry in 12.3s";
// Groq gửi header retry-after (giây) và câu "Please try again in 7.66s".
export function retryDelayMs(e: unknown): number | null {
  const fromBody = body(e).match(/"retryDelay"\s*:\s*"([\d.]+)s"/)?.[1];
  const fromHeader = APICallError.isInstance(e) ? e.responseHeaders?.['retry-after'] : undefined;
  const fromMessage = (e instanceof Error ? e.message : '').match(/(?:retry|try again) in ([\d.]+)s/i)?.[1];
  const seconds = fromBody ?? fromHeader ?? fromMessage;
  return seconds && Number.isFinite(Number(seconds)) ? Math.round(Number(seconds) * 1000) : null;
}

/** Hết quota trong ngày (không phải theo phút): chờ vài chục giây cũng vô ích. */
export function isDailyQuota(e: unknown): boolean {
  // Gemini: quotaId "...PerDay..." trong body · Groq: "requests per day (RPD)" / "tokens per day (TPD)" trong message.
  return is429(e) && /PerDay|per day|\b(RPD|TPD)\b/i.test(`${body(e)} ${e instanceof Error ? e.message : ''}`);
}

// Bị giới hạn tốc độ (429) giữa chừng: chờ đúng thời gian provider yêu cầu rồi gọi lại chính lượt đó,
// để agent loop chạy tiếp — không bỏ cả câu hỏi (và các tool đã chạy, điểm đã duyệt) như khi để lỗi nổi lên.
export function withRateLimitRetry(model: LanguageModel, o: RateLimitOptions = {}): ReturnType<typeof wrapLanguageModel> {
  const maxWait = o.maxWaitMs ?? 60_000;
  const attempts = o.attempts ?? 3;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  return wrapLanguageModel({
    model: model as WrappableModel,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async ({ doGenerate }) => {
        for (let attempt = 1; ; attempt++) {
          try {
            return await doGenerate();
          } catch (e) {
            const delay = retryDelayMs(e);
            if (!is429(e) || isDailyQuota(e) || delay === null || delay > maxWait || attempt > attempts) throw e;
            const ms = delay + PAD_MS;
            o.onWait?.(ms, attempt);
            await sleep(ms);
          }
        }
      },
    },
  });
}
