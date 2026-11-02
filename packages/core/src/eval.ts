import type { LanguageModel, ToolSet } from 'ai';
import { runQuestion } from './agent.js';
import { createLogger, type StepLog } from './logger.js';
import { describeApiError, isRateLimit } from './session.js';
import type { EvalReport, EvalRow, Golden, Outcome } from '@harness/shared/types';

export type { EvalReport, EvalRow, Golden, Outcome };

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

// `pnpm eval nam hung`: chỉ chấm nhóm được chọn — cả bộ 5 bài tốn ~20–25 lần gọi, bằng cả quota free tier một ngày.
export function pickGolden(golden: Golden, names: string[]): Golden {
  if (!names.length) return golden;
  const wanted = names.map((n) => n.trim().toLowerCase());
  const unknown = wanted.filter((n) => !(n in golden));
  if (unknown.length) throw new Error(`Không có trong eval/golden.json: ${unknown.join(', ')} (có: ${Object.keys(golden).join(', ')})`);
  return Object.fromEntries(Object.entries(golden).filter(([k]) => wanted.includes(k)));
}

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
