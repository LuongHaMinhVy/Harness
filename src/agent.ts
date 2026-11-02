import { generateText, stepCountIs, type LanguageModel, type ModelMessage, type StepResult, type ToolSet } from 'ai';
import { usageOf, type StepLog } from './logger.js';
import { LAST_STEP_NOTE } from './prompt.js';

export type RunOptions = {
  model: LanguageModel;
  system: string;
  history: ModelMessage[];
  tools: ToolSet;
  maxSteps: number;
  maxRetries?: number;
  onStep?: (s: StepLog) => void;
};

export type RunOutcome = {
  text: string;
  responseMessages: ModelMessage[];
  steps: StepLog[];
  hitLimit: boolean;
  totalMs: number;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

function toStepLog(step: StepResult<ToolSet>, ms: number): StepLog {
  // SDK v7 đánh dấu tool call có input sai schema bằng `invalid: true`, lỗi đi kèm nằm ở part tool-error.
  const invalid = new Set(step.toolCalls.filter((c) => (c as { invalid?: boolean }).invalid).map((c) => c.toolCallId));
  const outputs = new Map<string, unknown>();
  for (const part of step.content) {
    if (part.type === 'tool-result') outputs.set(part.toolCallId, part.output);
    if (part.type === 'tool-error') {
      const code = invalid.has(part.toolCallId) ? 'invalid_input' : 'tool_error';
      outputs.set(part.toolCallId, { error: code, message: errorMessage(part.error) });
    }
  }
  return {
    index: step.stepNumber + 1,
    toolCalls: step.toolCalls.map((c) => ({ name: c.toolName, input: c.input, output: outputs.get(c.toolCallId) })),
    text: step.text || undefined,
    finishReason: step.finishReason,
    usage: usageOf(step.usage, step.providerMetadata),
    ms,
  };
}

// Một câu hỏi = một lần generateText; SDK tự lặp gọi model → chạy tool tới khi model trả lời hoặc chạm maxSteps.
// Ở lượt cuối cấm gọi tool để model buộc phải trả lời bằng thông tin đã có. Lỗi API được ném ra cho session xử lý.
export async function runQuestion(o: RunOptions): Promise<RunOutcome> {
  const started = Date.now();
  let last = started;
  const steps: StepLog[] = [];

  const result = await generateText({
    model: o.model,
    instructions: o.system,
    messages: o.history,
    tools: o.tools,
    maxRetries: o.maxRetries ?? 2,
    stopWhen: stepCountIs(o.maxSteps),
    prepareStep: ({ stepNumber }) =>
      stepNumber === o.maxSteps - 1 ? { toolChoice: 'none', instructions: `${o.system}\n\n${LAST_STEP_NOTE}` } : {},
    onStepEnd: (step) => {
      const now = Date.now();
      const log = toStepLog(step, now - last);
      last = now;
      steps.push(log);
      o.onStep?.(log);
    },
  });

  return {
    text: result.text,
    responseMessages: result.responseMessages,
    steps,
    hitLimit: steps.length >= o.maxSteps,
    totalMs: Date.now() - started,
  };
}
