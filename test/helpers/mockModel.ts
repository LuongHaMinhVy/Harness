import { MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

export type ScriptStep = { tools: { name: string; input: object }[] } | { text: string } | { throws: unknown } | { wait: Promise<void>; text: string };

// Model giả chạy theo kịch bản: mỗi lần gọi lấy một bước kế tiếp.
// Như model thật, khi bị cấm gọi tool (toolChoice none) thì trả lời bằng chữ.
export function scriptedModel(script: ScriptStep[]) {
  let i = 0;
  return new MockLanguageModelV4({
    doGenerate: async (opts) => {
      const s = script[Math.min(i++, script.length - 1)];
      if ('throws' in s) throw s.throws;
      if ('wait' in s) await s.wait;
      if ('tools' in s && opts.toolChoice?.type !== 'none') {
        return {
          content: s.tools.map((t, k) => ({
            type: 'tool-call' as const,
            toolCallId: `c${i}-${k}`,
            toolName: t.name,
            input: JSON.stringify(t.input),
          })),
          finishReason: { unified: 'tool-calls' as const, raw: 'STOP' },
          usage,
          warnings: [],
        };
      }
      const text = 'text' in s ? s.text : 'Đã hết lượt — trả lời bằng thông tin hiện có.';
      return {
        content: [{ type: 'text' as const, text }],
        finishReason: { unified: 'stop' as const, raw: 'STOP' },
        usage,
        warnings: [],
      };
    },
  });
}
