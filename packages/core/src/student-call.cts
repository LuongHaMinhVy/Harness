// Tiến trình cô lập cho MỘT lần gọi vào bài nộp (Node 24 tự bỏ type khi chạy):
//   node --permission --allow-fs-read=<thư mục bài nộp>,<file này> --frozen-intrinsics student-call.cts <file chính>
// stdin: yêu cầu v8.serialize — { op: 'describe' } (liệt kê export) hoặc { op: 'call', name, args }.
// Trả lời một lần qua fd 3 (v8.serialize) rồi thoát ngay.
// Tiến trình này KHÔNG giữ bộ test, đáp án hay bí mật nào: bài nộp chỉ thấy đối số của đúng lần gọi này, nên chụp heap,
// đọc .caller hay ghi bừa ra fd 3 cũng không lấy được gì ngoài chính đầu vào của nó.
// File .cts (CommonJS) để require() được bài nộp viết theo module.exports.

type Request = { op: 'describe' } | { op: 'call'; name: string; args: unknown[] };
type ExportInfo = { type: 'function' } | { type: 'value'; value: unknown };
type Reply =
  | { kind: 'exports'; callable: boolean; exports: Record<string, ExportInfo> }
  | { kind: 'return'; value: unknown }
  | { kind: 'throw'; name: string; message: string }
  | { kind: 'load_error'; message: string };

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const v8 = require('node:v8') as typeof import('node:v8');

const RESULT_FD = 3;
const writeSync = fs.writeSync;
const serialize = v8.serialize;
const exit: (code: number) => never = process.exit.bind(process);

function reply(r: Reply): never {
  let buf: Buffer;
  try {
    buf = serialize(r);
  } catch {
    buf = serialize({ kind: 'throw', name: 'TypeError', message: 'Giá trị trả về không gửi được về bộ test (hàm, symbol hoặc đối tượng đặc biệt)' });
  }
  writeSync(RESULT_FD, buf);
  exit(0);
}

// Node 24 chưa có quyền chặn mạng: chặn ngay từ các cửa vào public (mọi http/https/tls/fetch đều đi qua
// net.Socket.connect). Chỉ là lớp bảo vệ thêm — chấm bài người lạ vẫn nên chạy trong container không có mạng.
function blockNetwork(): void {
  const deny = () => {
    throw new Error('Bài nộp không được dùng mạng');
  };
  // Chỉ khoá đúng các hàm mở kết nối (không đóng băng cả prototype — stream của Node tự gán thuộc tính lên đó).
  const lock = (obj: object, keys: string[]) => {
    for (const k of keys) Object.defineProperty(obj, k, { value: deny, writable: false, configurable: false });
  };
  const net = require('node:net') as typeof import('node:net');
  const dgram = require('node:dgram') as typeof import('node:dgram');
  const dns = require('node:dns') as typeof import('node:dns');
  const resolvers = ['lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'reverse'];
  lock(net.Socket.prototype, ['connect']);
  lock(net.Server.prototype, ['listen']);
  lock(dgram.Socket.prototype, ['bind', 'send', 'connect']);
  lock(dns, resolvers);
  lock(dns.promises, resolvers);
  lock(globalThis, ['fetch', 'WebSocket', 'EventSource']);
}

// Đổi đường dẫn tuyệt đối (thư mục bài nộp trên máy chủ) thành đường dẫn trong bài nộp, để thông báo lỗi
// hiện cho giảng viên/học viên không lộ cấu trúc thư mục của máy chủ.
function relativize(text: string, baseDir: string): string {
  const variants = [baseDir, baseDir.replace(/\\/g, '/')].map((b) => (b.endsWith('/') || b.endsWith('\\') ? b : `${b}${b.includes('\\') ? '\\' : '/'}`));
  let out = text;
  for (const v of variants) out = out.split(v).join('');
  return out.replace(/file:\/\/\/?/g, '');
}

function describeLoadError(err: unknown, baseDir: string): string {
  if (!(err instanceof Error)) return String(err);
  // Với SyntaxError, stack có dạng "<file>:<dòng>\n<code>\n   ^\n\nSyntaxError: ..." — giữ phần đó để chỉ ra dòng lỗi.
  const lines = String(err.stack ?? '').split('\n');
  const end = lines.findIndex((l) => l.startsWith(`${err.name}:`));
  const head = end >= 0 ? lines.slice(0, end + 1) : [`${err.name}: ${err.message}`];
  return relativize(head.filter((l) => l.trim() !== '').join('\n'), baseDir).slice(0, 600);
}

function thrown(err: unknown): Reply {
  if (err instanceof Error) return { kind: 'throw', name: String(err.name).slice(0, 60), message: String(err.message).slice(0, 500) };
  return { kind: 'throw', name: 'Error', message: String(err).slice(0, 500) };
}

async function main(): Promise<void> {
  const [entry] = process.argv.slice(2);
  const request = v8.deserialize(fs.readFileSync(0)) as Request;
  blockNetwork();
  console.log = console.error = console.warn = console.info = () => {};

  let mod: unknown;
  try {
    mod = require(entry);
  } catch (err) {
    reply({ kind: 'load_error', message: describeLoadError(err, path.dirname(entry)) });
  }

  if (request.op === 'describe') {
    const exports: Record<string, ExportInfo> = {};
    if (mod !== null && (typeof mod === 'object' || typeof mod === 'function')) {
      for (const key of Object.keys(mod as object)) {
        const value = (mod as Record<string, unknown>)[key];
        if (typeof value === 'function') exports[key] = { type: 'function' };
        else {
          try {
            serialize(value);
            exports[key] = { type: 'value', value };
          } catch {
            // giá trị không gửi được (symbol, đối tượng đặc biệt): bộ test thấy undefined
          }
        }
      }
    }
    reply({ kind: 'exports', callable: typeof mod === 'function', exports });
  }

  const fn = request.name === '' ? mod : (mod as Record<string, unknown> | null)?.[request.name];
  if (typeof fn !== 'function') reply({ kind: 'throw', name: 'TypeError', message: `${request.name || 'module.exports'} is not a function` });
  try {
    let value = (fn as (...a: unknown[]) => unknown).apply(mod, request.args);
    if (value !== null && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function') value = await value;
    reply({ kind: 'return', value });
  } catch (err) {
    reply(thrown(err));
  }
}

void main();
