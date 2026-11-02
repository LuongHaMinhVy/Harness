import type { ModelMessage } from 'ai';
import pc from 'picocolors';
import type { RunOutcome } from './agent.js';
import { isDailyQuota } from './rateLimit.js';

export type SessionDeps = {
  run: (history: ModelMessage[], maxSteps: number) => Promise<RunOutcome>;
  print: (s: string) => void;
  maxSteps: number;
  costReport: () => string;
};

const HELP = 'Lệnh: /steps N (đổi giới hạn lượt, 1–20) · /reset (xoá lịch sử) · /cost (tổng chi phí) · /exit';

// Lấy lỗi gốc: RetryError của SDK bọc lỗi cuối cùng trong lastError.
function rootErrorObject(e: unknown): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let err = e as any;
  while (err?.lastError) err = err.lastError;
  return err;
}

function rootError(e: unknown): { status?: number; message: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = rootErrorObject(e) as any;
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
  // Lỗi có thể đến từ Groq (model dự phòng) khi Gemini đã bị giới hạn: nói đúng tên và đúng biến môi trường.
  const isGroq = /api\.groq\.com/.test(String((rootErrorObject(e) as { url?: string } | undefined)?.url ?? ''));
  const who = isGroq ? 'Groq' : 'Gemini';
  const keyVar = isGroq ? 'GROQ_API_KEY' : 'GOOGLE_GENERATIVE_AI_API_KEY';
  if (isDailyQuota(rootErrorObject(e))) {
    return `Đã hết quota miễn phí trong ngày của ${who} — thử lại vào ngày mai, hoặc đổi model/API key trong .env.`;
  }
  if (isRateLimit(e)) {
    return `${who} vẫn đang giới hạn tốc độ (free tier) sau khi đã chờ — đợi khoảng 1 phút rồi hỏi lại.`;
  }
  if (status === 401 || status === 403 || /api.?key/i.test(message) || (status === 400 && /key/i.test(message))) {
    return `API key không hợp lệ hoặc thiếu — kiểm tra ${keyVar} trong .env.`;
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|network/i.test(message)) {
    return `Không kết nối được tới ${who} — kiểm tra mạng.`;
  }
  return `Lỗi khi gọi model: ${message}`;
}

export type AskResult = { ok: true; outcome: RunOutcome } | { ok: false; message: string };

// Dùng chung cho CLI và web: thêm câu hỏi vào lịch sử, chạy, nối câu trả lời;
// lỗi thì gỡ câu hỏi ra để lịch sử không bị lệch (user message không có câu trả lời).
export async function askWithHistory(
  history: ModelMessage[],
  question: string,
  run: (history: ModelMessage[]) => Promise<RunOutcome>,
): Promise<AskResult> {
  history.push({ role: 'user', content: question });
  try {
    const outcome = await run(history);
    history.push(...outcome.responseMessages);
    return { ok: true, outcome };
  } catch (e) {
    history.pop();
    return { ok: false, message: describeApiError(e) };
  }
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

      const r = await askWithHistory(history, line, (h) => d.run(h, maxSteps));
      d.print(r.ok ? `\n${pc.green('Trợ lý:')} ${r.outcome.text}` : pc.red(`✖ ${r.message}`));
      return 'continue';
    },
  };
}
