import 'dotenv/config';
import { APP_PATHS } from '@harness/core/config';
import { createGeminiModel } from './gemini.js';
import { parseNetworkConfig } from './network.js';
import { parseMaxSteps, parsePort, startWebServer } from './start.js';

const { model, modelName } = createGeminiModel();
await startWebServer({
  model,
  modelName,
  paths: APP_PATHS,
  maxSteps: parseMaxSteps(process.env.MAX_STEPS),
  port: parsePort(process.env.PORT),
  dev: process.argv.includes('--dev'),
  network: parseNetworkConfig(process.env, process.argv),
});
