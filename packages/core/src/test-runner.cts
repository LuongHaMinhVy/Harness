// Chạy trong tiến trình con: node --frozen-intrinsics test-runner.cts <submission> (Node 24 tự bỏ type khi chạy).
// Đọc {nonce, tests} từ stdin TRƯỚC khi nạp bài nộp, rồi ghi đúng một dòng "<nonce><json>" vào fd 3.
// Bài nộp chạy chung tiến trình nên mọi thứ runner cần (fs.writeSync, bộ test, assert) được lấy và đóng băng
// trước khi nạp bài; bài nộp không biết nonce nên không giả được kết quả, không thấy file test (không có quyền đọc).
// File .cts (CommonJS) để require() được bài nộp viết theo module.exports.

type TestCase = { name: string; run: (mod: unknown) => unknown };
type RunnerResult =
  | { status: 'ok'; results: { name: string; ok: boolean; error?: string }[] }
  | { status: 'load_error'; message: string };

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const vm = require('node:vm') as typeof import('node:vm');
const { builtinModules } = require('node:module') as typeof import('node:module');

const RESULT_FD = 3;
const writeSync = fs.writeSync;
const stringify = JSON.stringify;

function deepFreeze<T>(value: T, seen = new Set<unknown>()): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value as object)) {
    const desc = Reflect.getOwnPropertyDescriptor(value as object, key);
    if (desc && 'value' in desc) deepFreeze(desc.value, seen);
  }
  return Object.freeze(value);
}

// Bộ test chỉ được require module có sẵn của Node (assert, util…), không được đọc file nào.
function loadTests(source: string): TestCase[] {
  const mod = { exports: {} as unknown };
  const requireBuiltin = (id: string) => {
    if (!id.startsWith('node:') && !builtinModules.includes(id)) throw new Error(`Bộ test chỉ được dùng module có sẵn của Node, không được require "${id}"`);
    return require(id);
  };
  const fn = vm.compileFunction(source, ['module', 'exports', 'require'], { filename: 'tests.js' });
  fn(mod, mod.exports, requireBuiltin);
  return deepFreeze(mod.exports as TestCase[]);
}

// Đóng băng module dùng chung giữa bài nộp và bộ test, để bài nộp không thay được assert.equal = () => {}.
function freezeSharedModules(): void {
  for (const id of ['node:assert', 'node:assert/strict']) deepFreeze(require(id));
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

function readStdin(): Promise<string> {
  return new Promise((done) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c: string) => (data += c));
    process.stdin.on('end', () => done(data));
  });
}

async function main(): Promise<void> {
  const [submissionPath] = process.argv.slice(2);
  const input = JSON.parse(await readStdin()) as { nonce: string; tests: string };
  const nonce = input.nonce;
  const report = (result: RunnerResult) => writeSync(RESULT_FD, `${nonce}${stringify(result)}\n`);

  let tests: TestCase[];
  try {
    tests = loadTests(input.tests);
  } catch (err) {
    report({ status: 'load_error', message: `Bộ test của đề bị lỗi: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }
  freezeSharedModules();
  blockNetwork();
  process.stdin.destroy();

  console.log = console.error = console.warn = console.info = () => {};

  let mod: unknown;
  try {
    mod = require(submissionPath);
  } catch (err) {
    report({ status: 'load_error', message: describeLoadError(err, path.dirname(submissionPath)) });
    return;
  }

  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const t of tests) {
    try {
      await t.run(mod);
      results.push({ name: t.name, ok: true });
    } catch (err) {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      results.push({ name: t.name, ok: false, error: message.slice(0, 300) });
    }
  }
  report({ status: 'ok', results });
}

void main();
