import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { google } from '@ai-sdk/google';
import pc from 'picocolors';
import type { LanguageModel, ToolSet } from 'ai';
import { runQuestion } from './agent.js';
import { autoApprove } from './approval.js';
import { createLogger, type StepLog } from './logger.js';
import { buildSystemPrompt } from './prompt.js';
import { describeApiError, isRateLimit } from './session.js';
import { createTestCache } from './toolCache.js';
import { createTools } from './tools.js';

import type { EvalReport, EvalRow, Golden, Outcome } from './shared/types.js';

export type { EvalReport, EvalRow, Golden, Outcome };

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

export function scoreEval(golden: Golden, outcomes: Outcome[]): EvalReport {
  const rows: EvalRow[] = Object.entries(golden).map(([student, gold]) => {
    const o = outcomes.find((x) => x.student === student) ?? { student, aiScore: null, answer: '', costUsd: 0 };
    const missing = gold.mustMention.filter((re) => !new RegExp(re, 'i').test(o.answer));
    const diff = o.aiScore === null ? null : Math.abs(o.aiScore - gold.score);
    return { ...o, goldScore: gold.score, diff, mentionsOk: missing.length === 0, missing };
  });
  const scored = rows.filter((r) => r.diff !== null);
  return {
    rows,
    mae: scored.length ? scored.reduce((a, r) => a + r.diff!, 0) / scored.length : null,
    within1Pct: pct(scored.filter((r) => r.diff! <= 1).length, rows.length),
    mentionPct: pct(rows.filter((r) => r.mentionsOk).length, rows.length),
    noScore: rows.filter((r) => r.aiScore === null).map((r) => r.student),
    totalCostUsd: rows.reduce((a, r) => a + r.costUsd, 0),
  };
}

// Điểm AI = input.score của lần save_grade cuối cùng thực sự được lưu.
export function extractScore(steps: StepLog[]): number | null {
  const saved = steps
    .flatMap((s) => s.toolCalls)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((c) => c.name === 'save_grade' && (c.output as any)?.status === 'saved');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return saved.length ? Number((saved.at(-1)!.input as any).score) : null;
}

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Free tier giới hạn số request mỗi phút; bị 429 thì chờ hết cửa sổ rồi thử lại đúng một lần.
export async function retryOnRateLimit<T>(
  fn: () => Promise<T>,
  opts: { waitMs: number; sleep?: (ms: number) => Promise<void>; onWait?: () => void },
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isRateLimit(e)) throw e;
    opts.onWait?.();
    await (opts.sleep ?? sleepMs)(opts.waitMs);
    return fn();
  }
}

function savedComments(steps: StepLog[]): string {
  return steps
    .flatMap((s) => s.toolCalls)
    .filter((c) => c.name === 'save_grade')
    .map((c) => JSON.stringify(c.input))
    .join('\n');
}

export type EvalAnswer = { steps: StepLog[]; text: string; costUsd: number };
export type EvalDeps = {
  golden: Golden;
  ask: (student: string) => Promise<EvalAnswer>;
  pauseMs?: number;
  waitMs?: number;
  sleep?: (ms: number) => Promise<void>;
};
export type EvalHooks = {
  onStart?(student: string, index: number, total: number): void;
  onWait?(student: string): void;
  onRow?(outcome: Outcome, index: number, total: number): void;
  onError?(student: string, message: string): void;
};

// Vòng chấm bộ đánh giá, dùng chung cho CLI (`pnpm eval`) và web: mỗi học viên một lịch sử trống,
// giãn nhịp giữa các học viên, bị rate limit thì chờ rồi thử lại, lỗi ở một học viên không dừng cả bộ.
export async function runEval(deps: EvalDeps, hooks: EvalHooks = {}): Promise<EvalReport> {
  const sleep = deps.sleep ?? sleepMs;
  const students = Object.keys(deps.golden);
  const outcomes: Outcome[] = [];
  for (const [i, student] of students.entries()) {
    if (i > 0) await sleep(deps.pauseMs ?? 4000);
    hooks.onStart?.(student, i, students.length);
    let outcome: Outcome;
    try {
      const r = await retryOnRateLimit(() => deps.ask(student), {
        waitMs: deps.waitMs ?? 30_000,
        sleep,
        onWait: () => hooks.onWait?.(student),
      });
      outcome = { student, aiScore: extractScore(r.steps), answer: `${r.text}
${savedComments(r.steps)}`, costUsd: r.costUsd };
    } catch (e) {
      outcome = { student, aiScore: null, answer: '', costUsd: 0 };
      hooks.onError?.(student, describeApiError(e));
    }
    outcomes.push(outcome);
    hooks.onRow?.(outcome, i, students.length);
  }
  return scoreEval(deps.golden, outcomes);
}

// Tạo hàm chấm một học viên với lịch sử trống, ghi log vào logger.
export function createEvalAsk(o: {
  model: LanguageModel;
  system: string;
  tools: ToolSet;
  maxSteps: number;
  logger: ReturnType<typeof createLogger>;
}): (student: string) => Promise<EvalAnswer> {
  let n = 0;
  return async (student) => {
    const question = `Chấm bài của ${student}`;
    o.logger.startQuestion(++n, question);
    const r = await runQuestion({
      model: o.model,
      system: o.system,
      history: [{ role: 'user', content: question }],
      tools: o.tools,
      maxSteps: o.maxSteps,
      onStep: o.logger.step,
    });
    const total = o.logger.endQuestion(r.steps, r.totalMs, r.hitLimit, o.maxSteps);
    return { steps: r.steps, text: r.text, costUsd: total.costUsd };
  };
}

async function main() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error(pc.red('Thiếu GOOGLE_GENERATIVE_AI_API_KEY — xem .env.example.'));
    process.exit(1);
  }
  const golden: Golden = JSON.parse(readFileSync('eval/golden.json', 'utf8'));
  const modelId = process.env.MODEL ?? 'gemini-2.5-flash';
  const maxSteps = Number(process.env.MAX_STEPS ?? 6);
  const ask = createEvalAsk({
    model: google(modelId),
    system: buildSystemPrompt('data'),
    tools: createTools({
      dataDir: 'data',
      cache: createTestCache('.cache/tests.json'),
      approve: autoApprove,
      gradesFile: 'data/grades-eval.json',
    }),
    maxSteps,
    logger: createLogger({ file: `logs/eval-${new Date().toISOString().replaceAll(':', '-')}.jsonl`, print: () => {} }),
  });

  const report = await runEval(
    { golden, ask },
    {
      onStart: (student) => process.stdout.write(`▶ Chấm ${student}… `),
      onWait: () => process.stdout.write(pc.yellow('rate limit, chờ 30s… ')),
      onError: (_student, message) => console.log(pc.red(`✖ ${message}`)),
      onRow: (o) => {
        if (o.aiScore !== null) console.log(`${o.aiScore}/10`);
        else if (o.answer) console.log(pc.yellow('không có điểm'));
      },
    },
  );

  console.table(
    report.rows.map((r) => ({
      'học viên': r.student,
      'điểm GV': r.goldScore,
      'điểm AI': r.aiScore ?? '—',
      lệch: r.diff ?? '—',
      'nêu đủ lỗi': r.mentionsOk ? '✓' : `✗ thiếu: ${r.missing.join(', ')}`,
      'chi phí $': r.costUsd.toFixed(6),
    })),
  );
  console.log(pc.bold(`MAE: ${report.mae === null ? 'n/a' : report.mae.toFixed(2)} điểm`));
  console.log(`Lệch ≤ 1 điểm: ${report.within1Pct}% · Nêu đủ lỗi: ${report.mentionPct}%`);
  if (report.noScore.length) console.log(pc.yellow(`Không có điểm: ${report.noScore.join(', ')}`));
  console.log(`Tổng chi phí: ≈ $${report.totalCostUsd.toFixed(6)} (quy đổi)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
