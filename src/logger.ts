import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pc from 'picocolors';
import { costUsd, type Usage } from './pricing.js';

export type { Usage };
export type StepLog = {
  index: number;
  toolCalls: { name: string; input: unknown; output: unknown }[];
  text?: string;
  finishReason: string;
  usage: Usage;
  ms: number;
};

const MAX_SHOWN = 200;
const INDENT = '         ';

// Chỗ duy nhất đọc tên trường usage của AI SDK (v7: inputTokenDetails.cacheReadTokens).
export function usageOf(usage: unknown, providerMetadata?: unknown): Usage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = (usage ?? {}) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (providerMetadata ?? {}) as any;
  const cached =
    u.inputTokenDetails?.cacheReadTokens ??
    u.cachedInputTokens ??
    meta.google?.usageMetadata?.cachedContentTokenCount ??
    null;
  return { input: u.inputTokens ?? 0, cached, output: u.outputTokens ?? 0 };
}

const clip = (s: string) => (s.length > MAX_SHOWN ? `${s.slice(0, MAX_SHOWN - 1)}…` : s);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeOutput(name: string, output: any): string {
  if (output && typeof output === 'object' && 'error' in output) {
    return pc.red(clip(`✖ ${name} → ${output.error}: ${output.message ?? ''}`));
  }
  if (name === 'run_tests' && output && typeof output === 'object') {
    const cache = output.cached ? pc.green(`CACHE HIT (${output.cacheKey ?? ''}…)`) : `MISS · ${output.durationMs}ms`;
    if (output.status === 'timeout') return `${pc.red(`TIMEOUT ${output.timeoutMs / 1000}s`)} · ${cache}`;
    if (output.status === 'load_error') return `${pc.red(clip(`LOAD_ERROR: ${output.message}`))} · ${cache}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const failed = (output.results ?? []).filter((r: any) => !r.ok).map((r: any) => r.name);
    const detail = failed.length ? ` · trượt: ${failed.join(', ')}` : '';
    return `${clip(`${output.passed}/${output.total} test đạt${detail}`)} · ${cache}`;
  }
  return clip(JSON.stringify(output) ?? 'undefined');
}

function tokens(u: Usage): string {
  const cache = u.cached === null ? 'cache n/a' : `cache ${u.cached} · ${u.input ? Math.round((u.cached / u.input) * 100) : 0}%`;
  return pc.dim(`tok in ${u.input.toLocaleString('en-US')} (${cache}) · out ${u.output}`);
}

export function formatStep(s: StepLog): string {
  const head = `[lượt ${s.index}]`;
  const lines: string[] = [];
  if (s.toolCalls.length === 0) {
    lines.push(`${head} 💬 trả lời (${s.finishReason})`);
  }
  s.toolCalls.forEach((c, i) => {
    lines.push(`${i === 0 ? head : INDENT} ${pc.cyan(`🔧 ${c.name}`)} ${clip(JSON.stringify(c.input))}`);
    lines.push(`${INDENT}→ ${describeOutput(c.name, c.output)}`);
  });
  lines.push(`${INDENT}${tokens(s.usage)} · ${s.ms}ms`);
  return lines.join('\n');
}

function sum(steps: StepLog[]): Usage {
  const anyCache = steps.some((s) => s.usage.cached !== null);
  return {
    input: steps.reduce((a, s) => a + s.usage.input, 0),
    output: steps.reduce((a, s) => a + s.usage.output, 0),
    cached: anyCache ? steps.reduce((a, s) => a + (s.usage.cached ?? 0), 0) : null,
  };
}

const money = (usd: number) => `$${usd < 0.01 ? usd.toFixed(6) : usd.toFixed(4)}`;

export function formatSummary(steps: StepLog[], totalMs: number, hitLimit: boolean, maxSteps: number): string {
  const t = sum(steps);
  const cache = t.cached === null ? 'cache n/a' : `cache ${t.cached.toLocaleString('en-US')}`;
  const line = pc.bold(
    `─ Tổng: ${steps.length} lượt · in ${t.input.toLocaleString('en-US')} (${cache}) · out ${t.output} · ` +
      `≈ ${money(costUsd(t))} (quy đổi) · ${(totalMs / 1000).toFixed(1)}s`,
  );
  if (!hitLimit) return line;
  return `${pc.yellow(`⚠ Đã dùng hết ${maxSteps}/${maxSteps} lượt — câu trả lời dựa trên thông tin hiện có`)}\n${line}`;
}

export function createLogger(opts: { file: string; print?: (s: string) => void }) {
  const print = opts.print ?? ((s: string) => console.log(s));
  const session = { input: 0, cached: null as number | null, output: 0, costUsd: 0, questions: 0 };
  const write = (record: object) => {
    mkdirSync(dirname(opts.file), { recursive: true });
    appendFileSync(opts.file, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`);
  };

  return {
    startQuestion(n: number, question: string) {
      print(pc.bold(`\n── Câu #${n}: "${question}" ${'─'.repeat(20)}`));
      write({ type: 'question', n, question });
    },
    step(s: StepLog) {
      print(formatStep(s));
      write({ type: 'step', ...s });
    },
    endQuestion(steps: StepLog[], totalMs: number, hitLimit: boolean, maxSteps: number) {
      const t = sum(steps);
      const cost = costUsd(t);
      print(formatSummary(steps, totalMs, hitLimit, maxSteps));
      write({ type: 'summary', steps: steps.length, ...t, costUsd: cost, totalMs, hitLimit });
      session.input += t.input;
      session.output += t.output;
      if (t.cached !== null) session.cached = (session.cached ?? 0) + t.cached;
      session.costUsd += cost;
      session.questions += 1;
      return { ...t, costUsd: cost };
    },
    sessionTotal: () => ({ ...session }),
  };
}
