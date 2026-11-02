// Chạy giao diện web với model giả (không cần API key, không gọi Gemini) để thử giao diện.
import { parsePort, startWebServer } from '../src/web/start.js';
import { createMockModel } from './mockModel.js';

startWebServer({
  model: createMockModel(),
  modelName: 'mock (không gọi Gemini)',
  maxSteps: 6,
  port: parsePort(process.env.PORT),
  dev: process.argv.includes('--dev'),
});
