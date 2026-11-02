// Kiểu dữ liệu dùng chung giữa server (src/web) và giao diện (web/src).
// File này chỉ chứa type và schema zod, không phụ thuộc Node hay DOM.
import { z } from 'zod';
import { MAX_QUESTION_CHARS, type EvalReport, type EvalRow, type StepLog, type Usage } from './types.js';

export { MAX_QUESTION_CHARS };
export type { EvalReport, EvalRow, StepLog, Usage };

export type SessionTotal = Usage & { costUsd: number; questions: number };
export type QuestionSummary = Usage & { steps: number; costUsd: number; totalMs: number; hitLimit: boolean; maxSteps: number };

export type PendingApproval = {
  id: string;
  assignment: string;
  student: string;
  score: number;
  comments: string;
  expiresAt: number;
};
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout';
export type ApprovalView = PendingApproval & { status: ApprovalStatus };

export type Turn = {
  n: number;
  question: string;
  steps: StepLog[];
  approvals: ApprovalView[];
  summary?: QuestionSummary;
  answer?: string;
  error?: string;
};

export type GradeRecord = { assignment: string; student: string; score: number; comments: string; savedAt: string };

export type BusyKind = 'ask' | 'eval' | null;

export type EvalState = { running: boolean; rows: EvalRow[]; report?: EvalReport; waiting?: string; current?: string };

export type StateSnapshot = {
  /** seq của sự kiện cuối cùng đã áp dụng vào snapshot này. */
  seq: number;
  turns: Turn[];
  busy: boolean;
  busyKind: BusyKind;
  maxSteps: number;
  model: string;
  session: SessionTotal;
  eval: EvalState;
};

export type HarnessEvent =
  | { type: 'question'; n: number; text: string }
  | { type: 'step'; n: number; step: StepLog }
  | { type: 'summary'; n: number; summary: QuestionSummary }
  | { type: 'answer'; n: number; text: string }
  | { type: 'error'; n: number; message: string }
  | { type: 'approval'; n: number; approval: PendingApproval }
  | { type: 'approval-resolved'; id: string; approved: boolean; reason: 'user' | 'timeout' }
  | { type: 'grade-saved'; student: string }
  | { type: 'busy'; busy: boolean; kind: BusyKind }
  | { type: 'settings'; maxSteps: number }
  | { type: 'reset' }
  | { type: 'session'; total: SessionTotal }
  | { type: 'eval-start'; student: string; index: number; total: number }
  | { type: 'eval-wait'; student: string }
  | { type: 'eval-row'; row: EvalRow; index: number; total: number }
  | { type: 'eval-done'; report: EvalReport };

/** Gói gửi qua SSE: seq tăng dần để giao diện bỏ qua sự kiện đã có trong snapshot. */
export type EventEnvelope = { seq: number; event: HarnessEvent };


export const AskBody = z.object({ question: z.string().trim().min(1).max(MAX_QUESTION_CHARS) });
export const ApproveBody = z.object({ id: z.uuid(), approved: z.boolean() });
export const SettingsBody = z.object({ maxSteps: z.number().int().min(1).max(20) });
