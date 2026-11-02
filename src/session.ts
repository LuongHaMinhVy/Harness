import type { ModelMessage } from 'ai';
import pc from 'picocolors';
import type { RunOutcome } from './agent.js';

export type SessionDeps = {
  run: (history: ModelMessage[], maxSteps: number) => Promise<RunOutcome>;
  print: (s: string) => void;
  maxSteps: number;
  costReport: () => string;
};

const HELP = 'Lệnh: /steps N (đổi giới hạn lượt, 1–20) · /reset (xoá lịch sử) · /cost (tổng chi phí) · /exit';

// Lấy lỗi gốc: RetryError của SDK bọc lỗi cuối cùng trong lastError.
function rootError(e: unknown): { status?: number; message: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let err = e as any;
  while (err?.lastError) err = err.lastError;
  const status = err?.statusCode;
  const message = [err?.message, err?.cause?.message, err?.cause?.code].filter(Boolean).join(' ');
  return { status, message: message || String(e) };
}

export function isRateLimit(e: unknown): boolean {
  const { status, message } = rootError(e);
  return status === 429 || /resource.?exhausted|quota/i.test(message);
}

export function describeApiError(e: unknown): string {
  const { status, message } = rootError(e);
  if (isRateLimit(e)) {
    return 'Gemini đang giới hạn tốc độ (free tier) — đợi ~30s rồi hỏi lại.';
  }
  if (status === 401 || status === 403 || /api.?key/i.test(message) || (status === 400 && /key/i.test(message))) {
    return 'API key không hợp lệ hoặc thiếu — kiểm tra GOOGLE_GENERATIVE_AI_API_KEY trong .env.';
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|network/i.test(message)) {
    return 'Không kết nối được tới Gemini — kiểm tra mạng.';
  }
  return `Lỗi khi gọi model: ${message}`;
}

export function createSession(d: SessionDeps) {
  const history: ModelMessage[] = [];
  let maxSteps = d.maxSteps;

  function command(line: string): 'continue' | 'exit' {
    const [cmd, arg] = line.split(/\s+/);
    if (cmd === '/exit') return 'exit';
    if (cmd === '/reset') {
      history.length = 0;
      d.print('Đã xoá lịch sử hội thoại.');
    } else if (cmd === '/cost') {
      d.print(d.costReport());
    } else if (cmd === '/steps') {
      const n = Number(arg);
      if (Number.isInteger(n) && n >= 1 && n <= 20) {
        maxSteps = n;
        d.print(`Giới hạn lượt mỗi câu hỏi: ${n}.`);
      } else {
        d.print('Cách dùng: /steps N với N là số nguyên từ 1 đến 20.');
      }
    } else {
      d.print(HELP);
    }
    return 'continue';
  }

  return {
    history,
    async handleLine(raw: string): Promise<'continue' | 'exit'> {
      const line = raw.trim();
      if (!line) return 'continue';
      if (line.startsWith('/')) return command(line);

      history.push({ role: 'user', content: line });
      try {
        const outcome = await d.run(history, maxSteps);
        history.push(...outcome.responseMessages);
        d.print(`\n${pc.green('Trợ lý:')} ${outcome.text}`);
      } catch (e) {
        // Gỡ câu hỏi vừa thêm để lịch sử không bị lệch (user message không có câu trả lời).
        history.pop();
        d.print(pc.red(`✖ ${describeApiError(e)}`));
      }
      return 'continue';
    },
  };
}
