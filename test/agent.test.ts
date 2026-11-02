import { tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { expect, test } from 'vitest';
import { z } from 'zod';
import { runQuestion } from '../src/agent.js';
import type { StepLog } from '../src/logger.js';
import { LAST_STEP_NOTE } from '../src/prompt.js';

const usage = {
  inputTokens: { total: 100, noCache: 20, cacheRead: 80, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};
const toolCall = (toolName: string, input: object) => ({
  content: [{ type: 'tool-call' as const, toolCallId: `c${Math.random()}`, toolName, input: JSON.stringify(input) }],
  finishReason: { unified: 'tool-calls' as const, raw: 'STOP' },
  usage,
  warnings: [],
});
const answer = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const, raw: 'STOP' },
  usage,
  warnings: [],
});

const tools = {
  echo: tool({ inputSchema: z.object({ text: z.string() }), execute: async ({ text }) => ({ echoed: text }) }),
  grade: tool({ inputSchema: z.object({ score: z.number().max(10) }), execute: async () => ({ status: 'saved' }) }),
};

// Mock "cứng đầu": luôn gọi tool, chỉ trả lời khi bị cấm gọi tool.
function stubbornModel() {
  const choices: (string | undefined)[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (opts) => {
      choices.push(opts.toolChoice?.type);
      return opts.toolChoice?.type === 'none' ? answer('xong') : toolCall('echo', { text: 'a' });
    },
  });
  return { model, choices };
}

const base = { system: 'hệ thống', history: [{ role: 'user' as const, content: 'hỏi' }], tools };

test('maxSteps=3: 3 lượt, lượt cuối toolChoice none, hitLimit true, text "xong"', async () => {
  const { model, choices } = stubbornModel();
  const r = await runQuestion({ ...base, model, maxSteps: 3 });
  expect(r.steps).toHaveLength(3);
  expect(choices).toEqual(['auto', 'auto', 'none']);
  expect(r.hitLimit).toBe(true);
  expect(r.text).toBe('xong');
});

test('lượt cuối gửi kèm LAST_STEP_NOTE trong system', async () => {
  const { model } = stubbornModel();
  await runQuestion({ ...base, model, maxSteps: 2 });
  const lastPrompt = JSON.stringify(model.doGenerateCalls.at(-1)!.prompt);
  expect(lastPrompt).toContain(LAST_STEP_NOTE);
  expect(JSON.stringify(model.doGenerateCalls[0].prompt)).not.toContain(LAST_STEP_NOTE);
});

test('model trả lời ngay ở lượt 1 → 1 lượt, hitLimit false', async () => {
  const model = new MockLanguageModelV4({ doGenerate: async () => answer('chào') });
  const r = await runQuestion({ ...base, model, maxSteps: 6 });
  expect(r.steps).toHaveLength(1);
  expect(r.hitLimit).toBe(false);
  expect(r.steps[0]).toMatchObject({ index: 1, toolCalls: [], finishReason: 'stop', usage: { input: 100, cached: 80, output: 10 } });
});

test('onStep được gọi đúng số lượt với StepLog có toolCalls', async () => {
  const { model } = stubbornModel();
  const seen: StepLog[] = [];
  await runQuestion({ ...base, model, maxSteps: 3, onStep: (s) => seen.push(s) });
  expect(seen.map((s) => s.index)).toEqual([1, 2, 3]);
  expect(seen[0].toolCalls).toEqual([{ name: 'echo', input: { text: 'a' }, output: { echoed: 'a' } }]);
});

test('responseMessages chứa cả tool call và tool result', async () => {
  const { model } = stubbornModel();
  const r = await runQuestion({ ...base, model, maxSteps: 2 });
  expect(r.responseMessages.map((m) => m.role)).toEqual(['assistant', 'tool', 'assistant']);
});

test('tool input sai schema → không ném lỗi, StepLog output { error: "invalid_input" }, lượt sau vẫn chạy', async () => {
  let n = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => (n++ === 0 ? toolCall('grade', { score: 15 }) : answer('đã sửa')),
  });
  const r = await runQuestion({ ...base, model, maxSteps: 4 });
  expect(r.steps[0].toolCalls[0]).toMatchObject({ name: 'grade', output: { error: 'invalid_input' } });
  expect(r.text).toBe('đã sửa');
});
