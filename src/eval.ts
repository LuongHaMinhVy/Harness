import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { google } from '@ai-sdk/google';
import pc from 'picocolors';
import { runQuestion } from './agent.js';
import { autoApprove } from './approval.js';
import { createLogger, type StepLog } from './logger.js';
import { buildSystemPrompt } from './prompt.js';
import { describeApiError } from './session.js';
import { createTestCache } from './toolCache.js';
import { createTools } from './tools.js';

export type Golden = Record<string, { score: number; mustMention: string[] }>;
export type Outcome = { student: string; aiScore: number | null; answer: string; costUsd: number };
export type EvalRow = Outcome & { goldScore: number; diff: number | null; mentionsOk: boolean; missing: string[] };
export type EvalReport = {
  rows: EvalRow[];
  mae: number | null;
  within1Pct: number;
  mentionPct: number;
  noScore: string[];
  totalCostUsd: number;
};

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

function savedComments(steps: StepLog[]): string {
  return steps
    .flatMap((s) => s.toolCalls)
    .filter((c) => c.name === 'save_grade')
    .map((c) => JSON.stringify(c.input))
    .join('\n');
}

async function main() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error(pc.red('Thiếu GOOGLE_GENERATIVE_AI_API_KEY — xem .env.example.'));
    process.exit(1);
  }
  const golden: Golden = JSON.parse(readFileSync('eval/golden.json', 'utf8'));
  const modelId = process.env.MODEL ?? 'gemini-2.5-flash';
  const maxSteps = Number(process.env.MAX_STEPS ?? 6);
  const logger = createLogger({ file: `logs/eval-${new Date().toISOString().replaceAll(':', '-')}.jsonl`, print: () => {} });
  const tools = createTools({
    dataDir: 'data',
    cache: createTestCache('.cache/tests.json'),
    approve: autoApprove,
    gradesFile: 'data/grades-eval.json',
  });
  const system = buildSystemPrompt('data');
  const outcomes: Outcome[] = [];

  const students = Object.keys(golden);
  for (const [i, student] of students.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 4000)); // tránh rate limit của free tier
    process.stdout.write(`▶ Chấm ${student}… `);
    try {
      logger.startQuestion(i + 1, `Chấm bài của ${student}`);
      const r = await runQuestion({
        model: google(modelId),
        system,
        history: [{ role: 'user', content: `Chấm bài của ${student}` }],
        tools,
        maxSteps,
        onStep: logger.step,
      });
      const total = logger.endQuestion(r.steps, r.totalMs, r.hitLimit, maxSteps);
      const aiScore = extractScore(r.steps);
      outcomes.push({ student, aiScore, answer: `${r.text}\n${savedComments(r.steps)}`, costUsd: total.costUsd });
      console.log(aiScore === null ? pc.yellow('không có điểm') : `${aiScore}/10`);
    } catch (e) {
      outcomes.push({ student, aiScore: null, answer: '', costUsd: 0 });
      console.log(pc.red(`✖ ${describeApiError(e)}`));
    }
  }

  const report = scoreEval(golden, outcomes);
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
