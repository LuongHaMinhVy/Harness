// Model giả cho `pnpm web:mock`: chạy đúng quy trình chấm (đọc bài → chạy test → lưu điểm → trả lời)
// bằng tool thật, để thử giao diện khi chưa có API key. Không dùng trong code chạy thật.
import { MockLanguageModelV4 } from 'ai/test';

type Part = { type: string; text?: string; toolName?: string; output?: { type: string; value: unknown } };
type Message = { role: string; content: string | Part[] };
type ToolResult = { toolName: string; value: Record<string, unknown> };
type Reply = { text: string } | { tool: string; input: object };

const DELAY_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

function lastUserText(prompt: Message[]): { text: string; after: Message[] } {
  const i = prompt.map((m) => m.role).lastIndexOf('user');
  const m = prompt[i];
  const text = typeof m.content === 'string' ? m.content : m.content.map((p) => p.text ?? '').join(' ');
  return { text, after: prompt.slice(i + 1) };
}

function toolResults(messages: Message[]): ToolResult[] {
  return messages
    .filter((m) => m.role === 'tool' && Array.isArray(m.content))
    .flatMap((m) => m.content as Part[])
    .filter((p) => p.type === 'tool-result')
    .map((p) => ({ toolName: p.toolName ?? '', value: (p.output?.value ?? {}) as Record<string, unknown> }));
}

function scoreFrom(run: Record<string, unknown>): { score: number; comments: string } {
  if (run.status === 'timeout') return { score: 0, comments: 'Bài chạy quá thời gian (vòng lặp vô hạn), không chấm được phần chức năng.' };
  if (run.status === 'load_error') return { score: 0, comments: 'Bài lỗi cú pháp, không nạp được.' };
  const passed = Number(run.passed ?? 0);
  const failed = ((run.results ?? []) as { name: string; ok: boolean }[]).filter((r) => !r.ok).map((r) => r.name);
  const score = Math.min(10, passed * 2);
  return { score, comments: failed.length ? `Trượt test: ${failed.join(', ')}.` : 'Đúng hết test.' };
}

let calls = 0;

function step(prompt: Message[], toolChoice: string | undefined): Reply {
  const { text, after } = lastUserText(prompt);
  const results = toolResults(after);
  const student = normalize(text).match(/cua\s+([a-z]+)/)?.[1];

  if (/html/i.test(text)) return { text: 'Thử hiển thị: <b>đậm</b> <script>alert("xss")</script> — phải hiện nguyên văn.' };
  if (toolChoice === 'none') return { text: 'Đã hết lượt — trả lời bằng thông tin hiện có.' };
  if (!student) return { text: 'Đây là model giả để thử giao diện. Hãy hỏi "Chấm bài của Nam" (hoặc Lan, An, Hùng, Minh).' };

  const last = results.at(-1);
  if (last?.value.error) return { text: `Không chấm được bài của ${student}: ${String(last.value.message)}` };
  if (results.length === 0) return { tool: 'read_file', input: { path: `submissions/sum-array/${student}.js` } };
  if (results.length === 1) return { tool: 'run_tests', input: { assignment: 'sum-array', student } };
  if (results.length === 2) return { tool: 'save_grade', input: { assignment: 'sum-array', student, ...scoreFrom(last!.value) } };
  return last?.value.status === 'saved'
    ? { text: `Đã lưu điểm cho ${student}. ${scoreFrom(results[1].value).comments}` }
    : { text: `Giáo viên chưa duyệt nên chưa lưu điểm cho ${student}. Thầy/cô muốn sửa điểm thế nào?` };
}

export function createMockModel() {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'mock-grader',
    doGenerate: async (opts) => {
      await sleep(DELAY_MS);
      calls++;
      const s = step(opts.prompt as unknown as Message[], opts.toolChoice?.type);
      // Giả lập prompt cache: từ lần gọi thứ hai, phần lớn input được tính là cache.
      const input = 1400 + calls * 60;
      const usage = {
        inputTokens: { total: input, noCache: calls > 1 ? 200 : input, cacheRead: calls > 1 ? input - 200 : 0, cacheWrite: undefined },
        outputTokens: { total: 40, text: 40, reasoning: undefined },
      };
      if ('tool' in s) {
        return {
          content: [{ type: 'tool-call' as const, toolCallId: `mock-${calls}`, toolName: s.tool, input: JSON.stringify(s.input) }],
          finishReason: { unified: 'tool-calls' as const, raw: 'STOP' },
          usage,
          warnings: [],
        };
      }
      return { content: [{ type: 'text' as const, text: s.text }], finishReason: { unified: 'stop' as const, raw: 'STOP' }, usage, warnings: [] };
    },
  });
}
