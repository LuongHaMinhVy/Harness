// `pnpm eval`: chấm cả bộ bài mẫu và so với điểm giáo viên (eval/golden.json). `pnpm eval nam hung`: chỉ chấm vài bài.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { google } from '@ai-sdk/google';
import pc from 'picocolors';
import { autoApprove } from '@harness/core/approval';
import { createEvalAsk, pickGolden, runEval, type Golden } from '@harness/core/eval';
import { createLogger } from '@harness/core/logger';
import { countCalls, createQuotaCounter } from '@harness/core/quota';
import { withRateLimitRetry } from '@harness/core/rateLimit';
import { buildSystemPrompt } from '@harness/core/prompt';
import { createTestCache } from '@harness/core/toolCache';
import { createTools } from '@harness/core/tools';

async function main() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error(pc.red('Thiếu GOOGLE_GENERATIVE_AI_API_KEY — xem .env.example.'));
    process.exit(1);
  }
  let golden: Golden;
  try {
    golden = pickGolden(JSON.parse(readFileSync('eval/golden.json', 'utf8')), process.argv.slice(2));
  } catch (err) {
    console.error(pc.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
  const modelId = process.env.MODEL ?? 'gemini-2.5-flash';
  const maxSteps = Number(process.env.MAX_STEPS ?? 6);
  const quota = createQuotaCounter(`.cache/quota-${modelId}.json`);
  const ask = createEvalAsk({
    model: withRateLimitRetry(countCalls(google(modelId), quota.record), {
      onWait: (ms) => console.log(pc.yellow(`⏳ Gemini giới hạn tốc độ (free tier) — đợi ${Math.round(ms / 1000)}s rồi gọi lại…`)),
    }),
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
  console.log(pc.dim(quota.label()));
  console.log(`Lệch ≤ 1 điểm: ${report.within1Pct}% · Nêu đủ lỗi: ${report.mentionPct}%`);
  if (report.noScore.length) console.log(pc.yellow(`Không có điểm: ${report.noScore.join(', ')}`));
  console.log(`Tổng chi phí: ≈ $${report.totalCostUsd.toFixed(6)} (quy đổi)`);
}

await main();
