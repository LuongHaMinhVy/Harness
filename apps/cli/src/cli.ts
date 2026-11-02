import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { google } from '@ai-sdk/google';
import pc from 'picocolors';
import { runQuestion } from '@harness/core/agent';
import { createConsoleApprover } from '@harness/core/approval';
import { createLogger } from '@harness/core/logger';
import { buildSystemPrompt } from '@harness/core/prompt';
import { createSession } from '@harness/core/session';
import { createTestCache } from '@harness/core/toolCache';
import { createTools } from '@harness/core/tools';

const DATA_DIR = 'data';
const modelId = process.env.MODEL ?? 'gemini-2.5-flash';
const maxSteps = Number(process.env.MAX_STEPS ?? 6);

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error(
    pc.red('Thiếu GOOGLE_GENERATIVE_AI_API_KEY.') +
      '\nTạo key miễn phí tại https://aistudio.google.com/apikey, rồi chép .env.example thành .env và điền key.',
  );
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const logger = createLogger({ file: `logs/session-${new Date().toISOString().replaceAll(':', '-')}.jsonl` });
const tools = createTools({
  dataDir: DATA_DIR,
  cache: createTestCache('.cache/tests.json'),
  approve: createConsoleApprover((q) => rl.question(q)),
  gradesFile: `${DATA_DIR}/grades.json`,
});
const system = buildSystemPrompt(DATA_DIR);
let questionNo = 0;

const session = createSession({
  maxSteps,
  print: (s) => console.log(s),
  costReport: () => {
    const t = logger.sessionTotal();
    const cache = t.cached === null ? 'n/a' : t.cached.toLocaleString('en-US');
    return `Cả phiên: ${t.questions} câu · in ${t.input.toLocaleString('en-US')} (cache ${cache}) · out ${t.output} · ≈ $${t.costUsd.toFixed(6)} (quy đổi)`;
  },
  run: async (history, steps) => {
    const last = history.at(-1);
    logger.startQuestion(++questionNo, typeof last?.content === 'string' ? last.content : '');
    const outcome = await runQuestion({ model: google(modelId), system, history, tools, maxSteps: steps, onStep: logger.step });
    logger.endQuestion(outcome.steps, outcome.totalMs, outcome.hitLimit, steps);
    return outcome;
  },
});

console.log(pc.bold('Trợ lý chấm bài lập trình — bài tập sum-array'));
console.log(pc.dim(`Model: ${modelId} · tối đa ${maxSteps} lượt/câu · /steps N · /reset · /cost · /exit`));

rl.on('SIGINT', () => {
  rl.close();
  process.exit(0);
});

// stdin đóng (Ctrl+D, hết input) hoặc /exit: thoát êm, không để await treo.
rl.on('close', () => process.exit(0));

while (true) {
  const line = await rl.question(pc.cyan('\nBạn: '));
  if ((await session.handleLine(line)) === 'exit') break;
}
rl.close();
