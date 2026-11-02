// Kiểu dữ liệu cốt lõi dùng chung cho phần lõi (Node) và giao diện web — không phụ thuộc Node hay DOM.

/** Độ dài tối đa của một câu hỏi gửi lên web. */
export const MAX_QUESTION_CHARS = 2000;

export type Usage = { input: number; cached: number | null; output: number };

export type StepLog = {
  index: number;
  toolCalls: { name: string; input: unknown; output: unknown }[];
  text?: string;
  finishReason: string;
  usage: Usage;
  ms: number;
};

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
