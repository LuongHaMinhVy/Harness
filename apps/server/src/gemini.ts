import { google } from '@ai-sdk/google';
import { countCalls, createQuotaCounter } from '@harness/core/quota';
import { withRateLimitRetry } from '@harness/core/rateLimit';

// Model Gemini thật cho web (pnpm web, pnpm web:demo): đếm lần gọi theo quota ngày của free tier, và bị chặn theo phút
// thì chờ đúng thời gian Gemini yêu cầu rồi gọi lại lượt đó. Thiếu API key thì dừng với hướng dẫn.
export function createGeminiModel() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error(
      'Thiếu GOOGLE_GENERATIVE_AI_API_KEY.\n' +
        'Tạo key miễn phí tại https://aistudio.google.com/apikey, chép .env.example thành .env và điền key.\n' +
        'Muốn thử giao diện khi chưa có key: pnpm web:mock',
    );
    process.exit(1);
  }
  const modelName = process.env.MODEL ?? 'gemini-2.5-flash';
  const quota = createQuotaCounter(`.cache/quota-${modelName}.json`);
  console.log(quota.label());
  const model = withRateLimitRetry(countCalls(google(modelName), () => console.log(`Gemini: ${quota.record()}/${quota.limit} lần gọi hôm nay (free tier)`)), {
    onWait: (ms) => console.log(`⏳ Gemini giới hạn tốc độ (free tier) — đợi ${Math.round(ms / 1000)}s rồi gọi lại…`),
  });
  return { model, modelName };
}
