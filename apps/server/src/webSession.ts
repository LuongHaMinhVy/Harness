import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LanguageModel, ModelMessage } from 'ai';
import { runQuestion } from '@harness/core/agent';
import { autoApprove } from '@harness/core/approval';
import { createEvalAsk, runEval, scoreEval, type Golden } from '@harness/core/eval';
import { createLogger, type StepLog } from '@harness/core/logger';
import { buildSystemPrompt } from '@harness/core/prompt';
import { askWithHistory } from '@harness/core/session';
import type { BusyKind, GradeRecord, HarnessEvent, StateSnapshot } from '@harness/shared/events';
import { emptySnapshot, reduce } from '@harness/shared/reduce';
import { createTestCache } from '@harness/core/toolCache';
import { createTools } from '@harness/core/tools';
import { createWebApprover } from './webApprover.js';

export type WebSessionDeps = {
  model: LanguageModel;
  modelName: string;
  dataDir: string;
  gradesFile: string;
  evalGradesFile: string;
  cacheFile: string;
  logDir: string;
  goldenFile: string;
  maxSteps: number;
  approvalTimeoutMs?: number;
  evalPauseMs?: number;
  evalWaitMs?: number;
};

export type WebSession = ReturnType<typeof createWebSession>;

const stamp = () => new Date().toISOString().replaceAll(':', '-');

function savedStudents(step: StepLog): string[] {
  return step.toolCalls
    .filter((c) => c.name === 'save_grade' && (c.output as { status?: string } | undefined)?.status === 'saved')
    .map((c) => String((c.input as { student?: unknown }).student ?? ''));
}

// Phiên web duy nhất của server: bọc phần lõi (agent loop, tool, logger, eval), phát HarnessEvent cho SSE
// và giữ snapshot bằng chính reducer mà giao diện dùng. Mỗi lúc chỉ chạy một việc (câu hỏi hoặc eval).
export function createWebSession(d: WebSessionDeps) {
  const listeners = new Set<(e: HarnessEvent, seq: number) => void>();
  const history: ModelMessage[] = [];
  let state: StateSnapshot = emptySnapshot(d.modelName, d.maxSteps);
  let questionNo = 0;
  let job: Promise<void> = Promise.resolve();

  const emit = (e: HarnessEvent) => {
    state = { ...reduce(state, e), seq: state.seq + 1 };
    for (const fn of listeners) fn(e, state.seq);
  };
  const setBusy = (kind: BusyKind) => emit({ type: 'busy', busy: kind !== null, kind });

  const logger = createLogger({ file: join(d.logDir, `web-${stamp()}.jsonl`), print: () => {} });
  const approver = createWebApprover({ emit, turn: () => questionNo, timeoutMs: d.approvalTimeoutMs });
  const cache = createTestCache(d.cacheFile);
  const system = buildSystemPrompt(d.dataDir);
  const tools = createTools({ dataDir: d.dataDir, cache, approve: approver.approve, gradesFile: d.gradesFile });

  // Chạy một việc nền; lỗi ngoài dự kiến cũng không để server kẹt ở trạng thái bận.
  function start(kind: Exclude<BusyKind, null>, work: () => Promise<void>, onCrash: () => void) {
    setBusy(kind);
    job = work()
      .catch((err) => {
        console.error('[web] lỗi nội bộ:', err);
        onCrash();
      })
      .finally(() => setBusy(null));
  }

  function ask(question: string): 'started' | 'busy' {
    if (state.busy) return 'busy';
    const n = ++questionNo;
    const maxSteps = state.maxSteps;
    start(
      'ask',
      async () => {
        emit({ type: 'question', n, text: question });
        logger.startQuestion(n, question);
        const r = await askWithHistory(history, question, (h) =>
          runQuestion({
            model: d.model,
            system,
            history: h,
            tools,
            maxSteps,
            onStep: (step) => {
              logger.step(step);
              emit({ type: 'step', n, step });
              for (const student of savedStudents(step)) emit({ type: 'grade-saved', student });
            },
          }),
        );
        if (!r.ok) {
          emit({ type: 'error', n, message: r.message });
          return;
        }
        const { steps, totalMs, hitLimit } = r.outcome;
        const total = logger.endQuestion(steps, totalMs, hitLimit, maxSteps);
        emit({ type: 'summary', n, summary: { ...total, steps: steps.length, totalMs, hitLimit, maxSteps } });
        emit({ type: 'session', total: logger.sessionTotal() });
        emit({ type: 'answer', n, text: r.outcome.text });
      },
      () => emit({ type: 'error', n, message: 'Lỗi nội bộ của harness — xem log server.' }),
    );
    return 'started';
  }

  function runEvalJob(): 'started' | 'busy' {
    if (state.busy) return 'busy';
    start(
      'eval',
      async () => {
        const golden: Golden = JSON.parse(readFileSync(d.goldenFile, 'utf8'));
        const evalAsk = createEvalAsk({
          model: d.model,
          system,
          tools: createTools({ dataDir: d.dataDir, cache, approve: autoApprove, gradesFile: d.evalGradesFile }),
          maxSteps: state.maxSteps,
          logger: createLogger({ file: join(d.logDir, `eval-web-${stamp()}.jsonl`), print: () => {} }),
        });
        const report = await runEval(
          { golden, ask: evalAsk, pauseMs: d.evalPauseMs, waitMs: d.evalWaitMs },
          {
            onStart: (student, index, total) => emit({ type: 'eval-start', student, index, total }),
            onWait: (student) => emit({ type: 'eval-wait', student }),
            onError: (student, message) => emit({ type: 'eval-error', student, message }),
            onRow: (outcome, index, total) => {
              const row = scoreEval({ [outcome.student]: golden[outcome.student] }, [outcome]).rows[0];
              emit({ type: 'eval-row', row, index, total });
            },
          },
        );
        emit({ type: 'eval-done', report });
      },
      () => {
        emit({ type: 'eval-error', student: '', message: 'Không chạy được bộ đánh giá (kiểm tra eval/golden.json) — xem log server.' });
        emit({ type: 'eval-done', report: scoreEval({}, []) });
      },
    );
    return 'started';
  }

  return {
    subscribe(fn: (e: HarnessEvent, seq: number) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot: () => state,
    ask,
    approve: (id: string, approved: boolean) => approver.resolve(id, approved),
    setMaxSteps: (maxSteps: number) => emit({ type: 'settings', maxSteps }),
    reset(): boolean {
      if (state.busy) return false;
      history.length = 0;
      approver.rejectAll();
      emit({ type: 'reset' });
      return true;
    },
    runEval: runEvalJob,
    grades(): GradeRecord[] {
      try {
        const data = JSON.parse(readFileSync(d.gradesFile, 'utf8'));
        return Array.isArray(data) ? [...data].sort((a, b) => a.student.localeCompare(b.student)) : [];
      } catch {
        return [];
      }
    },
    historyLength: () => history.length,
    listenerCount: () => listeners.size,
    idle: () => job,
  };
}
