import 'dotenv/config';
import { google } from '@ai-sdk/google';
import { parseMaxSteps, parsePort, startWebServer } from './start.js';

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error(
    'Thiếu GOOGLE_GENERATIVE_AI_API_KEY.\n' +
      'Tạo key miễn phí tại https://aistudio.google.com/apikey, chép .env.example thành .env và điền key.\n' +
      'Muốn thử giao diện khi chưa có key: pnpm web:mock',
  );
  process.exit(1);
}

const modelName = process.env.MODEL ?? 'gemini-2.5-flash';
startWebServer({
  model: google(modelName),
  modelName,
  maxSteps: parseMaxSteps(process.env.MAX_STEPS),
  port: parsePort(process.env.PORT),
  dev: process.argv.includes('--dev'),
});
