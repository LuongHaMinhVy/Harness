// Chạy giao diện web với model giả (không cần API key, không gọi Gemini) để thử giao diện.
import { MOCK_PATHS } from '@harness/core/config';
import { parsePort, startWebServer } from '../start.js';
import { createMockModel } from './mockModel.js';

startWebServer({
  model: createMockModel(),
  modelName: 'mock (không gọi Gemini)',
  paths: MOCK_PATHS,
  maxSteps: 6,
  port: parsePort(process.env.PORT),
  dev: process.argv.includes('--dev'),
});
