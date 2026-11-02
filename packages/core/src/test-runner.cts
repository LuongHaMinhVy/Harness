// Giám khảo (Node 24 tự bỏ type khi chạy): node --permission --allow-fs-read=<runner> --frozen-intrinsics test-runner.cts
// Giữ bộ test ẩn và tự chạy assert, nhưng KHÔNG BAO GIỜ nạp bài nộp và cũng không được tạo tiến trình (bộ test do giảng
// viên viết chạy ở đây). Mỗi lần bộ test gọi một hàm của bài nộp, giám khảo gửi yêu cầu cho tiến trình cha (sandbox.ts)
// qua fd 3 rồi chờ trả lời đồng bộ trên stdin; tiến trình cha chạy đúng lần gọi đó trong một tiến trình student-call.cts
// cô lập. Nhờ vậy code học viên không chạm được tới bộ test, đáp án hay kênh báo kết quả.
// Giao thức (mỗi dòng một JSON): stdin dòng đầu { tests } · fd 3 { type: 'call', payload } → stdin { status, code, payload }
// · cuối cùng fd 3 { type: 'result', result }.
// File .cts (CommonJS) để chạy bộ test viết theo module.exports.

type TestCase = { name: string; run: (mod: unknown) => unknown };
type RunnerResult =
  | { status: 'ok'; results: { name: string; ok: boolean; error?: string }[] }
  | { status: 'timeout' }
  | { status: 'load_error'; message: string };
type CallReply = { status: 'ok' | 'timeout' | 'too_big' | 'exit'; code?: number | null; payload?: string };
type Reply =
  | { kind: 'exports'; callable: boolean; exports: Record<string, { type: 'function' } | { type: 'value'; value: unknown }> }
  | { kind: 'return'; value: unknown }
  | { kind: 'throw'; name: string; message: string }
  | { kind: 'load_error'; message: string };

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const v8 = require('node:v8') as typeof import('node:v8');
const vm = require('node:vm') as typeof import('node:vm');
const { builtinModules } = require('node:module') as typeof import('node:module');

const RESULT_FD = 3;
const ERROR_TYPES: Record<string, ErrorConstructor> = { Error, TypeError, RangeError, SyntaxError, ReferenceError, EvalError, URIError };

class CallTimeout extends Error {}
class LoadFailure extends Error {}

const send = (msg: unknown) => fs.writeSync(RESULT_FD, `${JSON.stringify(msg)}\n`);
const report = (result: RunnerResult) => send({ type: 'result', result });

// Đọc từng dòng từ stdin một cách đồng bộ (chờ tiến trình cha trả lời giữa lúc bộ test đang chạy).
let pending = Buffer.alloc(0);
function readLine(): string {
  const chunk = Buffer.alloc(64 * 1024);
  for (;;) {
    const nl = pending.indexOf(10);
    if (nl >= 0) {
      const line = pending.subarray(0, nl).toString('utf8');
      pending = pending.subarray(nl + 1);
      return line;
    }
    let n: number;
    try {
      n = fs.readSync(0, chunk, 0, chunk.length, null);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EAGAIN') continue;
      throw err;
    }
    if (n === 0) throw new Error('Tiến trình cha đóng kênh giữa chừng');
    pending = Buffer.concat([pending, chunk.subarray(0, n)]);
  }
}

// Bộ test chỉ được require module có sẵn của Node (assert, util…), không được đọc file nào.
// Biên dịch ở strict mode: hàm gọi từ bộ test không lộ qua .caller (lớp bảo vệ thêm — bài nộp vốn ở tiến trình khác).
function loadTests(source: string): TestCase[] {
  const mod = { exports: {} as unknown };
  const requireBuiltin = (id: string) => {
    if (!id.startsWith('node:') && !builtinModules.includes(id)) throw new Error(`Bộ test chỉ được dùng module có sẵn của Node, không được require "${id}"`);
    return require(id);
  };
  const fn = vm.compileFunction(`'use strict';\n${source}`, ['module', 'exports', 'require'], { filename: 'tests.js' });
  fn(mod, mod.exports, requireBuiltin);
  return mod.exports as TestCase[];
}

function invoke(request: { op: 'describe' } | { op: 'call'; name: string; args: unknown[] }): Reply {
  let payload: Buffer;
  try {
    payload = v8.serialize(request);
  } catch {
    throw new TypeError('Đối số không gửi được sang bài nộp (bộ test truyền hàm hoặc đối tượng đặc biệt)');
  }
  send({ type: 'call', payload: payload.toString('base64') });
  const r = JSON.parse(readLine()) as CallReply;
  if (r.status === 'timeout') throw new CallTimeout();
  if (r.status === 'too_big') throw new RangeError('Bài nộp trả về quá nhiều dữ liệu');
  if (!r.payload) {
    const message = `Bài nộp thoát mà không trả kết quả (mã ${r.code})`;
    if (request.op === 'describe') throw new LoadFailure(message);
    throw new Error(message);
  }
  try {
    return v8.deserialize(Buffer.from(r.payload, 'base64')) as Reply;
  } catch {
    throw new Error('Bài nộp trả về dữ liệu hỏng');
  }
}

// Đối tượng thay cho module của bài nộp mà bộ test nhìn thấy: mỗi hàm export là một lần gọi sang tiến trình cô lập.
function studentModule(): unknown {
  const info = invoke({ op: 'describe' });
  if (info.kind === 'load_error') throw new LoadFailure(info.message);
  if (info.kind !== 'exports') throw new LoadFailure('Không đọc được danh sách export của bài nộp');
  const call =
    (name: string) =>
    (...args: unknown[]): unknown => {
      const r = invoke({ op: 'call', name, args });
      if (r.kind === 'return') return r.value;
      if (r.kind === 'throw') {
        const Ctor = ERROR_TYPES[r.name] ?? Error;
        const err = new Ctor(r.message);
        if (!(r.name in ERROR_TYPES)) Object.defineProperty(err, 'name', { value: r.name });
        throw err;
      }
      throw new Error(r.kind === 'load_error' ? r.message : 'Bài nộp trả lời sai giao thức');
    };
  const mod: Record<string, unknown> = info.callable ? (call('') as unknown as Record<string, unknown>) : {};
  for (const [key, e] of Object.entries(info.exports)) mod[key] = e.type === 'function' ? call(key) : e.value;
  return mod;
}

async function main(): Promise<void> {
  const input = JSON.parse(readLine()) as { tests: string };
  let tests: TestCase[];
  try {
    tests = loadTests(input.tests);
  } catch (err) {
    report({ status: 'load_error', message: `Bộ test của đề bị lỗi: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }

  let mod: unknown;
  try {
    mod = studentModule();
  } catch (err) {
    if (err instanceof CallTimeout) report({ status: 'timeout' });
    else report({ status: 'load_error', message: err instanceof Error ? err.message : String(err) });
    return;
  }

  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const t of tests) {
    try {
      await t.run(mod);
      results.push({ name: t.name, ok: true });
    } catch (err) {
      if (err instanceof CallTimeout) {
        report({ status: 'timeout' });
        return;
      }
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      results.push({ name: t.name, ok: false, error: message.slice(0, 300) });
    }
  }
  report({ status: 'ok', results });
}

void main();
