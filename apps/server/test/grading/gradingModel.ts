import { MockLanguageModelV4 } from 'ai/test';

type Part = { type: string; text?: string };
type Message = { role: string; content: string | Part[] };

const usage = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

// Model giả cho test chấm bài: đọc câu hỏi chấm ("học viên "<tên>" … bài "<mã>"") rồi làm đúng quy trình
// list_files → run_tests → save_grade(score) → trả lời. Mỗi lần chấm độc lập nên chạy song song được.
export function gradingModel(opts: { score: number | ((student: string) => number); fail?: unknown }) {
  return new MockLanguageModelV4({
    doGenerate: async (call) => {
      if (opts.fail) throw opts.fail;
      const prompt = call.prompt as unknown as Message[];
      const i = prompt.map((m) => m.role).lastIndexOf('user');
      const q = prompt[i].content;
      const text = typeof q === 'string' ? q : q.map((p) => p.text ?? '').join(' ');
      const student = text.match(/học viên "([^"]+)"/)?.[1] ?? '';
      const assignment = text.match(/bài "([^"]+)"/)?.[1] ?? '';
      const done = prompt.slice(i + 1).filter((m) => m.role === 'tool').length;
      const score = typeof opts.score === 'function' ? opts.score(student) : opts.score;
      const tool = (toolName: string, input: object) => ({
        content: [{ type: 'tool-call' as const, toolCallId: `c-${student}-${done}`, toolName, input: JSON.stringify(input) }],
        finishReason: { unified: 'tool-calls' as const, raw: 'STOP' },
        usage,
        warnings: [],
      });
      if (call.toolChoice?.type !== 'none') {
        if (done === 0) return tool('list_files', { assignment, student });
        if (done === 1) return tool('run_tests', { assignment, student });
        if (done === 2) return tool('save_grade', { assignment, student, score, comments: `Nhận xét cho ${student}` });
      }
      return { content: [{ type: 'text' as const, text: `Đã chấm ${student}` }], finishReason: { unified: 'stop' as const, raw: 'STOP' }, usage, warnings: [] };
    },
  });
}
