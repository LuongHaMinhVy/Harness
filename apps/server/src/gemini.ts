import { createHarnessModel } from '@harness/core/models';

// Model thật cho web (pnpm web, pnpm web:demo): Gemini, có Groq dự phòng nếu .env có GROQ_API_KEY.
// Thiếu key Gemini thì dừng với hướng dẫn.
export function createGeminiModel() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error(
      'Thiếu GOOGLE_GENERATIVE_AI_API_KEY.\n' +
        'Tạo key miễn phí tại https://aistudio.google.com/apikey, chép .env.example thành .env và điền key.\n' +
        'Muốn thử giao diện khi chưa có key: pnpm web:mock',
    );
    process.exit(1);
  }
  const { model, label, quotaLabel } = createHarnessModel(process.env, (s) => console.log(`${s}\n${quotaLabel()}`));
  console.log(quotaLabel());
  return { model, modelName: label };
}
