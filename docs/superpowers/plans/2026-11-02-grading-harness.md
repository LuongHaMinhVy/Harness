# Harness chấm bài lập trình — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một CLI chat chấm bài JavaScript theo rubric, thể hiện đủ 7 yêu cầu của bài tập buổi 2 cùng phần nâng cao (duyệt trước khi ghi + bộ đánh giá).

**Architecture:** Mỗi câu hỏi là một lần `generateText` của Vercel AI SDK với 4 tool tự viết. `stopWhen` giới hạn số lượt, `prepareStep` cấm tool ở lượt cuối. Lịch sử là mảng `ModelMessage[]` chỉ nối thêm. Bài nộp chạy trong tiến trình con có timeout, kết quả được cache theo sha256. Mọi lỗi tool trả về model dưới dạng dữ liệu; lỗi API được bắt ở tầng session và không làm thoát REPL.

**Tech Stack:** Node ≥ 20, TypeScript chạy bằng `tsx`, `ai` + `@ai-sdk/google` + `zod`, `vitest`, `dotenv`, `picocolors`.

**Spec:** `docs/superpowers/specs/2026-11-02-grading-harness-design.md`

## Global Constraints

- Toàn bộ thông báo cho người dùng và log viết bằng tiếng Việt.
- Model lấy từ biến môi trường `MODEL`, key từ `GOOGLE_GENERATIVE_AI_API_KEY`, giới hạn lượt mặc định `MAX_STEPS=6`.
- Bài tập mẫu duy nhất: `sum-array`. Đường dẫn tool tương đối với `data/`, cấm thoát ra ngoài `data/`.
- Timeout chạy test: 3000 ms. `read_file` cắt nội dung ở 20.000 ký tự. Kết quả tool trên terminal cắt ở 200 ký tự.
- `SYSTEM_PROMPT` không được chứa thời gian hay giá trị thay đổi giữa các lần gọi.
- Không cắt `history`. Chỉ `/reset` mới xoá.
- Không lỗi nào được làm thoát REPL. Chỉ `/exit` hoặc Ctrl+C mới thoát.
- Chi phí hiển thị ghi rõ "(quy đổi)". Giá lấy từ trang pricing chính thức của Google và ghi kèm ngày tra cứu.
- Mọi tên trường usage của AI SDK đều đọc qua `usageOf()` (Task 6), không đọc trực tiếp ở nơi khác.

## Review Focus

1. Model truyền tên học viên viết hoa hoặc có `.js`, ví dụ `"Nam"`, `"nam.js"`: tool phải chuẩn hoá thành `nam`, không báo "không tồn tại" (Task 4).
2. Bài nộp có `console.log`: không được làm hỏng JSON kết quả của runner (Task 2).
3. Bài nộp gọi `process.exit()` hoặc tiến trình con chết mà không in kết quả: trả về `load_error` có mã thoát, không treo và không crash (Task 2).
4. `read_file` trỏ vào một thư mục: trả lỗi `not_found` thay vì ném `EISDIR` ra ngoài (Task 4).
5. Người dùng bấm Enter với dòng trống: bỏ qua, không gửi lên model và không tốn request free tier (Task 8).

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example` | Cấu hình dự án |
| `scripts/spike.ts` | Spike: kiểm chứng cache và `prepareStep` trên Gemini thật |
| `data/assignments/sum-array/{README.md,rubric.md,tests.js}` | Đề, rubric, bộ test |
| `data/submissions/sum-array/{nam,lan,an,hung,minh}.js` | 5 bài nộp mẫu |
| `eval/golden.json` | Điểm giáo viên |
| `src/test-runner.cjs` | Chạy trong tiến trình con: nạp bài, chạy test, in kết quả |
| `src/sandbox.ts` | Spawn runner, timeout, parse kết quả |
| `src/toolCache.ts` | Cache kết quả chạy test theo sha256, lưu file |
| `src/tools.ts` | `ToolError`, `safeTool`, `createTools` (4 tool) |
| `src/approval.ts` | `Approver`: hỏi y/n hoặc tự duyệt |
| `src/prompt.ts` | `buildSystemPrompt`, `LAST_STEP_NOTE` |
| `src/pricing.ts` | Bảng giá, `costUsd` |
| `src/logger.ts` | `usageOf`, format từng lượt và tổng câu hỏi, ghi JSONL |
| `src/agent.ts` | `runQuestion` |
| `src/session.ts` | History, lệnh `/…`, rollback khi lỗi API, `describeApiError` |
| `src/cli.ts` | Nối readline với session (mỏng) |
| `src/eval.ts` | `scoreEval` + chạy bộ đánh giá |
| `test/*.test.ts` | Unit test |

Kiểu dùng chung, định nghĩa trong `src/sandbox.ts`:

```ts
export type TestCaseResult = { name: string; ok: boolean; error?: string };
export type RunResult =
  | { status: 'ok'; passed: number; total: number; results: TestCaseResult[] }
  | { status: 'timeout'; timeoutMs: number }
  | { status: 'load_error'; message: string };
```

---

### Task 1: Khởi tạo dự án + spike Gemini

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `scripts/spike.ts`, `docs/superpowers/spike-results.md`

**Interfaces:**
- Produces: scripts `npm start` → `tsx src/cli.ts`, `npm run eval` → `tsx src/eval.ts`, `npm test` → `vitest run`, `npm run spike` → `tsx scripts/spike.ts`. Ghi lại phiên bản `ai` đã cài, tên trường cache token thực tế, và việc `prepareStep` có nhận `system` hay không vào `spike-results.md`. Task 6 và 7 dựa vào file này.

- [ ] **Step 1: Khởi tạo và cài đặt**

Run: `npm init -y` rồi `npm i ai @ai-sdk/google zod dotenv picocolors` và `npm i -D typescript tsx vitest @types/node`.
Đặt `"type": "module"` trong `package.json`. `tsconfig.json`: `module`/`moduleResolution` = `NodeNext`, `target` = `ES2022`, `strict: true`, `noEmit: true`.
Nội dung `.env.example`: `GOOGLE_GENERATIVE_AI_API_KEY=`, `MODEL=gemini-2.5-flash`, `MAX_STEPS=6`.

- [ ] **Step 2: Viết `scripts/spike.ts`**

Spike gồm hai phần:
1. Một system prompt cố định dài khoảng 1500 token (lặp lại một đoạn rubric giả), 1 tool `echo`, `stopWhen: stepCountIs(3)`, và `prepareStep` trả `{ toolChoice: 'none', system: system + '\nLượt cuối.' }` ở `stepNumber === 2`. Gọi 2 câu hỏi liên tiếp có nối history.
2. In ra `JSON.stringify(step.usage)` và `step.providerMetadata` của từng lượt, cùng `steps.length` và `finishReason` của lượt cuối.

- [ ] **Step 3: Chạy spike với key thật**

Run: `npm run spike`
Expected: chạy không lỗi; lượt cuối có `finishReason` khác `tool-calls`. Ghi vào `spike-results.md`: phiên bản `ai`, trường nào chứa cached tokens (`usage.cachedInputTokens`, `usage.inputTokenDetails.cacheReadTokens` hay `providerMetadata.google.usageMetadata.cachedContentTokenCount`), câu 2 có cache > 0 không, `prepareStep` có nhận `system` không. Nếu không nhận, ghi rõ để Task 7 dùng phương án nối user message.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .env.example scripts docs/superpowers/spike-results.md
git commit -m "chore: khởi tạo dự án và spike Gemini cache/prepareStep"
```

---

### Task 2: Dữ liệu mẫu + test runner + sandbox

**Files:**
- Create: `data/assignments/sum-array/{README.md,rubric.md,tests.js}`, `data/submissions/sum-array/{nam,lan,an,hung,minh}.js`, `eval/golden.json`, `src/test-runner.cjs`, `src/sandbox.ts`
- Create fixtures: `test/fixtures/{noisy.js,exits.js}`
- Test: `test/sandbox.test.ts`

**Interfaces:**
- Produces: `runSubmission(submissionPath: string, testsPath: string, timeoutMs = 3000): Promise<RunResult>` cùng các kiểu ở mục File Structure.

**Quyết định về dữ liệu:**
- Bài nộp export `module.exports = { sumArray }`.
- `tests.js` export `[{ name: string, run: (mod) => void }]` gồm 5 test, mỗi test dùng `node:assert/strict`:
  `số dương` ([1,2,3] → 6), `số âm và thập phân` ([-1, 2.5] → 1.5), `một phần tử` ([7] → 7), `mảng rỗng` ([] → 0), `không phải mảng` (`sumArray("abc")` ném `TypeError`).
- `rubric.md`: 3 test chức năng đầu × 2 điểm = 6; mảng rỗng = 1; TypeError = 1; chất lượng code (tên rõ ràng, không `var`, không biến toàn cục) = 2. Tổng 10.
- Bài nộp mẫu:
  - `nam`: đúng hết, code sạch.
  - `lan`: `arr.reduce((a, b) => a + b)` không có giá trị khởi tạo, nên trượt test mảng rỗng.
  - `an`: dùng `var` và biến toàn cục, không kiểm tra kiểu, nên trượt test không phải mảng.
  - `hung`: `while` không bao giờ dừng trong `sumArray`.
  - `minh`: lỗi cú pháp (thiếu `}`).
- `eval/golden.json`:

```json
{
  "nam":  { "score": 10, "mustMention": [] },
  "lan":  { "score": 9,  "mustMention": ["rỗng|empty"] },
  "an":   { "score": 7,  "mustMention": ["TypeError", "var|toàn cục|global"] },
  "hung": { "score": 0,  "mustMention": ["timeout|vô hạn|treo"] },
  "minh": { "score": 0,  "mustMention": ["cú pháp|syntax"] }
}
```

`mustMention`: mỗi phần tử là một regex, khớp không phân biệt hoa thường.

**Giao thức runner:** chạy `node src/test-runner.cjs <submission> <tests>`. Runner thay `console.log`, `console.error` và `process.stdout.write` bằng hàm no-op trong lúc nạp bài và chạy test, rồi in **một dòng cuối** `__RESULT__<json>`. JSON đó có dạng `{status:'ok', results}` hoặc `{status:'load_error', message}`. Sandbox tìm dòng có tiền tố `__RESULT__`. Không có dòng đó thì trả `load_error` với message `"Tiến trình chạy test thoát mà không trả kết quả (mã <code>)"`. Lỗi khi `require` bài nộp được báo là `load_error`.

- [ ] **Step 1: Tạo dữ liệu mẫu, golden, fixtures**

`test/fixtures/noisy.js`: bài đúng nhưng `console.log` mỗi lần gọi. `test/fixtures/exits.js`: gọi `process.exit(3)` ngay khi được require.

- [ ] **Step 2: Viết test thất bại `test/sandbox.test.ts`**

```ts
const T = 'data/assignments/sum-array/tests.js';
const S = (n: string) => `data/submissions/sum-array/${n}.js`;
test('nam đạt 5/5', async () => expect(await runSubmission(S('nam'), T)).toMatchObject({ status: 'ok', passed: 5, total: 5 }));
test('lan trượt đúng test mảng rỗng', async () => {
  const r = await runSubmission(S('lan'), T);
  expect(r).toMatchObject({ status: 'ok', passed: 4 });
  expect(r.status === 'ok' && r.results.find(x => !x.ok)?.name).toBe('mảng rỗng');
});
test('hung bị timeout', async () => expect(await runSubmission(S('hung'), T, 1000)).toEqual({ status: 'timeout', timeoutMs: 1000 }), 5000);
test('minh lỗi cú pháp', async () => expect(await runSubmission(S('minh'), T)).toMatchObject({ status: 'load_error' }));
test('console.log trong bài không làm hỏng kết quả', async () => expect(await runSubmission('test/fixtures/noisy.js', T)).toMatchObject({ status: 'ok', passed: 5 }));
test('process.exit trả load_error có mã thoát', async () => {
  const r = await runSubmission('test/fixtures/exits.js', T);
  expect(r.status).toBe('load_error');
  expect(r.status === 'load_error' && r.message).toContain('3');
});
```

- [ ] **Step 3: Chạy để thấy thất bại**

Run: `npx vitest run test/sandbox.test.ts`
Expected: FAIL vì không tìm thấy module `../src/sandbox`.

- [ ] **Step 4: Viết `src/test-runner.cjs` và `src/sandbox.ts`**

Sandbox dùng `spawn(process.execPath, [runnerPath, abs(submission), abs(tests)])`. Hết `timeoutMs` thì `child.kill('SIGKILL')` và resolve timeout. `passed`/`total` tính từ `results`.

- [ ] **Step 5: Chạy để thấy đạt**

Run: `npx vitest run test/sandbox.test.ts`
Expected: PASS 6/6.

- [ ] **Step 6: Commit**

```bash
git add data eval src/test-runner.cjs src/sandbox.ts test
git commit -m "feat: dữ liệu mẫu sum-array và sandbox chạy test có timeout"
```

---

### Task 3: Cache kết quả chạy test

**Files:**
- Create: `src/toolCache.ts`
- Test: `test/toolCache.test.ts`

**Interfaces:**
- Consumes: `RunResult` (Task 2).
- Produces:

```ts
export interface TestCache {
  key(submissionSource: string, testsSource: string): string; // sha256 hex
  get(key: string): RunResult | undefined;
  set(key: string, result: RunResult): void;                  // ghi file đồng bộ ngay
}
export function createTestCache(file: string): TestCache;      // file chưa có hoặc JSON hỏng → bắt đầu rỗng
```

- [ ] **Step 1: Viết test thất bại**

Các test cần có:
- `cùng nội dung → cùng key; đổi 1 ký tự bài nộp → key khác`.
- `set rồi get trả lại đúng kết quả`.
- `instance mới đọc lại từ file`: set ở cache A, `createTestCache(sameFile)` lần nữa rồi get ra được.
- `file JSON hỏng → cache rỗng, không ném lỗi`.

Dùng file tạm trong `os.tmpdir()`.

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npx vitest run test/toolCache.test.ts`
Expected: FAIL vì không tìm thấy module.

- [ ] **Step 3: Viết `src/toolCache.ts`**

Dùng `crypto.createHash('sha256').update(submission + '\0' + tests)`. Gọi `mkdirSync(dirname(file), {recursive: true})` trước khi ghi.

- [ ] **Step 4: Chạy để thấy đạt**

Run: `npx vitest run test/toolCache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/toolCache.ts test/toolCache.test.ts
git commit -m "feat: cache kết quả run_tests theo sha256"
```

---

### Task 4: Tool đọc và chạy test + `safeTool`

**Files:**
- Create: `src/tools.ts`, `src/approval.ts` (chỉ khai báo kiểu, Task 5 hoàn thiện)
- Test: `test/tools.test.ts`

**Interfaces:**
- Consumes: `runSubmission` (Task 2), `TestCache` (Task 3).
- Produces:

```ts
// approval.ts
export type GradeRequest = { assignment: string; student: string; score: number; comments: string };
export type Approver = (req: GradeRequest) => Promise<boolean>;

// tools.ts
export class ToolError extends Error { constructor(public code: string, message: string, public hint?: string) }
export type ToolFailure = { error: string; message: string; hint?: string };
export function safeTool<A, R>(fn: (args: A) => Promise<R>): (args: A) => Promise<R | ToolFailure>;
export type ToolDeps = { dataDir: string; cache: TestCache; approve: Approver; gradesFile: string; timeoutMs?: number };
export function createTools(deps: ToolDeps): {
  list_submissions: Tool; read_file: Tool; run_tests: Tool; save_grade: Tool;
};
export function normalizeStudent(name: string): string; // trim, lowercase, bỏ đuôi .js
```

Output và mã lỗi đúng như bảng ở spec mục 4. `run_tests` thành công trả `RunResult & { cached: boolean; durationMs: number }`.

Mã lỗi:
- `assignment_not_found`, `student_not_found`: hint `"dùng list_submissions để xem tên hợp lệ"`.
- `not_found`: dùng cho cả file thiếu lẫn đường dẫn trỏ vào thư mục.
- `outside_data_dir`.

Bước này mới chỉ có 3 tool `list_submissions`, `read_file`, `run_tests`. `save_grade` để Task 5 thêm.

- [ ] **Step 1: Viết test thất bại**

Gọi trực tiếp `tools.x.execute(args, {toolCallId: 't', messages: []})`. Dùng `dataDir` thật (`data`), cache trỏ vào file tạm.

```ts
test('list_submissions liệt kê 5 học viên', ...)               // students sắp xếp = ['an','hung','lan','minh','nam']
test('list_submissions đề không tồn tại → assignment_not_found', ...)
test('read_file đọc rubric', ...)                               // content chứa 'TypeError'
test('read_file ../package.json → outside_data_dir', ...)
test('read_file trỏ vào thư mục → not_found', ...)              // path 'submissions/sum-array'
test('run_tests "Nam.js" được chuẩn hoá thành nam, 5/5', ...)
test('run_tests lần 2 cùng bài → cached true', ...)
test('run_tests học viên tuan → student_not_found kèm hint', ...)
test('safeTool biến Error thường thành { error: "internal" }', ...)
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npx vitest run test/tools.test.ts`
Expected: FAIL vì không tìm thấy module.

- [ ] **Step 3: Viết `src/tools.ts`**

Dùng `tool({ description, inputSchema: z.object(...), execute: safeTool(...) })`. Kiểm tra path bằng `path.relative(dataDirAbs, target)`: nếu bắt đầu bằng `..` hoặc là đường dẫn tuyệt đối thì trả `outside_data_dir`. `ToolError` → `{error: code, message, hint}`; lỗi khác → `{error: 'internal', message}`. Viết `description` bằng tiếng Việt và nói rõ thứ tự nên dùng: đọc rubric → đọc bài → chạy test → lưu điểm.

- [ ] **Step 4: Chạy để thấy đạt**

Run: `npx vitest run test/tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts src/approval.ts test/tools.test.ts
git commit -m "feat: tool list_submissions, read_file, run_tests và safeTool"
```

---

### Task 5: `save_grade` + duyệt trước khi ghi

**Files:**
- Modify: `src/tools.ts`, `src/approval.ts`
- Test: `test/saveGrade.test.ts`

**Interfaces:**
- Produces:

```ts
export const autoApprove: Approver;                                            // luôn true
export function createConsoleApprover(ask: (q: string) => Promise<string>): Approver;
// in khung "⏸  Model muốn lưu: <student> · <score>/10 · "<comments>"" rồi hỏi "Duyệt? (y/n) "; 'y'/'yes'/'c'/'có' (không phân biệt hoa thường) → true, còn lại → false
```

- `save_grade`: input `{assignment, student, score: z.number().min(0).max(10), comments: z.string().min(1)}`.
- Gọi `deps.approve`. Từ chối → `{status: 'rejected_by_user'}`, không ghi gì.
- Đồng ý → đọc `gradesFile` (thiếu hoặc hỏng thì coi là `[]`), thay bản ghi cùng `assignment+student`, ghi lại, trả `{status: 'saved'}`.

- [ ] **Step 1: Viết test thất bại**

```ts
test('duyệt → ghi vào grades file', ...)                   // file có 1 bản ghi nam, score 9
test('chấm lại cùng học viên → ghi đè, vẫn 1 bản ghi', ...)
test('từ chối → rejected_by_user, file không đổi', ...)
test('học viên không tồn tại → student_not_found, không hỏi duyệt', ...) // approver spy không được gọi
test('createConsoleApprover: "Y" → true, "n" → false, "" → false', ...)
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npx vitest run test/saveGrade.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết `save_grade`, `autoApprove`, `createConsoleApprover`**

- [ ] **Step 4: Chạy để thấy đạt**

Run: `npx vitest run test/saveGrade.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts src/approval.ts test/saveGrade.test.ts
git commit -m "feat: save_grade với bước duyệt y/n"
```

---

### Task 6: Prompt, bảng giá, logger

**Files:**
- Create: `src/prompt.ts`, `src/pricing.ts`, `src/logger.ts`
- Test: `test/prompt.test.ts`, `test/pricing.test.ts`, `test/logger.test.ts`

**Interfaces:**
- Produces:

```ts
// prompt.ts
export function buildSystemPrompt(dataDir: string, assignment?: string): string; // mặc định 'sum-array'; nhúng README.md + rubric.md
export const LAST_STEP_NOTE: string; // đúng câu ở spec mục 5.1

// pricing.ts
export const PRICES: { model: string; inputPerM: number; cachedPerM: number; outputPerM: number; checkedAt: string };
export type Usage = { input: number; cached: number | null; output: number };
export function costUsd(u: Usage): number; // (input - (cached ?? 0))*in + (cached ?? 0)*cache + output*out, chia 1e6

// logger.ts
export function usageOf(stepOrResultUsage: unknown, providerMetadata?: unknown): Usage; // đọc theo trường đã ghi trong spike-results.md
export type StepLog = { index: number; toolCalls: { name: string; input: unknown; output: unknown }[]; text?: string; finishReason: string; usage: Usage; ms: number };
export function formatStep(s: StepLog): string;     // định dạng spec mục 6; cache null → "cache n/a"
export function formatSummary(steps: StepLog[], totalMs: number, hitLimit: boolean, maxSteps: number): string;
export function createLogger(opts: { file: string; print?: (s: string) => void }): {
  startQuestion(n: number, question: string): void;
  step(s: StepLog): void;          // in formatStep + append 1 dòng JSONL đầy đủ
  endQuestion(steps: StepLog[], totalMs: number, hitLimit: boolean, maxSteps: number): Usage & { costUsd: number };
  sessionTotal(): Usage & { costUsd: number; questions: number };
};
```

Quy tắc của `formatStep`:
- Mỗi tool call một dòng `🔧 name {input}`, kèm dòng kết quả cắt 200 ký tự.
- Output có `error` → in đỏ `✖ name → <error>`.
- Output `run_tests` có `cached: true` → `CACHE HIT`; `cached: false` → `MISS · <durationMs>ms`.
- `status: 'timeout'` → `TIMEOUT <timeoutMs/1000>s`.
- Không có tool call → `💬 trả lời (<finishReason>)`.

Với `formatSummary`: nếu `hitLimit` thì thêm dòng `⚠ Đã dùng hết N/N lượt — câu trả lời dựa trên thông tin hiện có`.

- [ ] **Step 1: Tra giá**

Mở trang pricing chính thức của Gemini API, lấy giá input / cached input / output mỗi 1M token của model trong `.env.example`. Điền vào `PRICES` kèm `checkedAt` là ngày tra cứu.

- [ ] **Step 2: Viết test thất bại**

```ts
test('system prompt chứa rubric và không đổi giữa 2 lần gọi', ...)           // buildSystemPrompt('data') === buildSystemPrompt('data'), chứa 'TypeError'
test('costUsd tính phần cache theo giá cache', ...)                           // với PRICES giả {1,0.25,4}: {input:1e6,cached:5e5,output:1e6} → 0.5+0.125+4 = 4.625
test('costUsd cached null coi như 0', ...)
test('formatStep run_tests cached → chứa "CACHE HIT"', ...)
test('formatStep lỗi tool → chứa "✖ read_file → not_found"', ...)
test('formatStep cắt output dài còn ≤ 200 ký tự', ...)
test('formatSummary hitLimit → chứa "Đã dùng hết 2/2 lượt"', ...)
test('createLogger ghi 1 dòng JSONL mỗi step', ...)
```

`costUsd` cần nhận `prices` làm tham số tuỳ chọn (mặc định `PRICES`) để test được với giá giả.

- [ ] **Step 3: Chạy để thấy thất bại**

Run: `npx vitest run test/prompt.test.ts test/pricing.test.ts test/logger.test.ts`
Expected: FAIL.

- [ ] **Step 4: Viết 3 module**

`buildSystemPrompt` nêu vai trò trợ lý chấm bài và quy trình đọc rubric → đọc bài → chạy test → đề xuất điểm → `save_grade`. Prompt cũng dặn: khi tool trả `error` thì đọc `hint` và thử lại hoặc giải thích; trả lời bằng tiếng Việt. Sau đó nhúng nguyên văn README và rubric.

- [ ] **Step 5: Chạy để thấy đạt**

Run: `npx vitest run test/prompt.test.ts test/pricing.test.ts test/logger.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/prompt.ts src/pricing.ts src/logger.ts test/prompt.test.ts test/pricing.test.ts test/logger.test.ts
git commit -m "feat: system prompt, bảng giá quy đổi và logger từng lượt"
```

---

### Task 7: Agent loop với giới hạn lượt

**Files:**
- Create: `src/agent.ts`
- Test: `test/agent.test.ts`

**Interfaces:**
- Consumes: `LAST_STEP_NOTE` (Task 6), `StepLog`, `usageOf` (Task 6).
- Produces:

```ts
export type RunOptions = {
  model: LanguageModel; system: string; history: ModelMessage[]; tools: ToolSet;
  maxSteps: number; maxRetries?: number; onStep?: (s: StepLog) => void;
};
export type RunOutcome = { text: string; responseMessages: ModelMessage[]; steps: StepLog[]; hitLimit: boolean; totalMs: number };
export function runQuestion(o: RunOptions): Promise<RunOutcome>;
```

- `hitLimit = steps.length >= maxSteps`.
- Ở lượt `stepNumber === maxSteps - 1`, `prepareStep` trả `toolChoice: 'none'` cùng `LAST_STEP_NOTE`. Nếu spike ghi là được thì gắn qua `system`; nếu không, nối user message `LAST_STEP_NOTE` vào cuối `messages` của lượt đó.
- `onStep` nhận `StepLog` dựng từ callback `onStepFinish`; `ms` là thời gian từ lượt trước.
- Content part `tool-error` của SDK (input sai schema, hoặc tool ném lỗi lọt qua `safeTool`) được ghi vào `StepLog.toolCalls[].output` dưới dạng `{ error: 'invalid_input' | 'tool_error', message }`, nhờ đó `formatStep` in được `✖`.
- Lỗi API không bắt ở đây mà để ném ra cho session.

- [ ] **Step 1: Viết test thất bại với mock model của `ai/test`**

Dùng lớp mock tương ứng phiên bản `ai` đã cài (`MockLanguageModelV2`/`V3`). Mock trả về một tool call `echo` khi `toolChoice` khác `none`, và trả text `"xong"` khi `toolChoice.type === 'none'`. Ghi lại `toolChoice` của mỗi lần gọi.

```ts
test('maxSteps=3: 3 lượt, lượt cuối toolChoice none, hitLimit true, text "xong"', ...)
test('model trả lời ngay ở lượt 1 → 1 lượt, hitLimit false', ...)
test('onStep được gọi đúng số lượt với StepLog có toolCalls', ...)
test('responseMessages chứa cả tool call và tool result', ...)
test('tool input sai schema → không ném lỗi, StepLog output { error: "invalid_input" }, lượt sau vẫn chạy', ...) // tool có inputSchema z.object({score: z.number().max(10)}), mock gửi score 15 ở lượt 1
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npx vitest run test/agent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết `src/agent.ts`**

- [ ] **Step 4: Chạy để thấy đạt**

Run: `npx vitest run test/agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent.ts test/agent.test.ts
git commit -m "feat: runQuestion với giới hạn lượt và ép trả lời ở lượt cuối"
```

---

### Task 8: Session + CLI

**Files:**
- Create: `src/session.ts`, `src/cli.ts`
- Test: `test/session.test.ts`

**Interfaces:**
- Consumes: `runQuestion`, `RunOutcome` (Task 7); `createLogger` (Task 6); `createTools` (Task 4/5); `createConsoleApprover` (Task 5); `buildSystemPrompt` (Task 6).
- Produces:

```ts
export function describeApiError(e: unknown): string;
// statusCode 429 → "Gemini đang giới hạn tốc độ (free tier) — đợi ~30s rồi hỏi lại."
// 400/401/403 hoặc message chứa "API key" → "API key không hợp lệ hoặc thiếu — kiểm tra GOOGLE_GENERATIVE_AI_API_KEY trong .env."
// lỗi mạng (fetch failed, ECONNREFUSED, ENOTFOUND, ETIMEDOUT) → "Không kết nối được tới Gemini — kiểm tra mạng."
// khác → "Lỗi khi gọi model: <message>"

export type SessionDeps = { run: (history: ModelMessage[], maxSteps: number) => Promise<RunOutcome>; print: (s: string) => void; maxSteps: number; costReport: () => string };
export function createSession(d: SessionDeps): {
  history: ModelMessage[];
  handleLine(line: string): Promise<'continue' | 'exit'>;
};
```

Hành vi của `handleLine`:
- Dòng trống hoặc chỉ có khoảng trắng → bỏ qua, không gọi `run`.
- `/steps N` (N nguyên 1–20) đổi `maxSteps`; sai giá trị thì in hướng dẫn.
- `/reset` xoá history.
- `/cost` in `costReport()`. `cli.ts` nối hàm này với `logger.sessionTotal()`.
- `/exit` → `'exit'`.
- Lệnh `/…` lạ in danh sách lệnh.
- Câu hỏi thường: push user message rồi gọi `run`. Thành công thì nối `responseMessages` và in text. Ném lỗi thì **pop user message** và in `✖ ` + `describeApiError(e)`.
- Mọi trường hợp (trừ `/exit`) trả `'continue'`.

`cli.ts` (không unit test):
- Nạp `dotenv`, tạo `readline/promises`.
- Tạo approver bằng `createConsoleApprover(q => rl.question(q))`, tools, cache `.cache/tests.json`, logger `logs/session-<ISO, thay ':' bằng '-'>.jsonl`.
- Mỗi câu gọi `logger.startQuestion` và `logger.endQuestion` quanh `runQuestion`.
- In banner gồm model, `maxSteps` và danh sách lệnh, rồi lặp `handleLine` tới khi gặp `'exit'`.
- Thiếu key thì in hướng dẫn tạo key ở Google AI Studio rồi thoát với mã 1. Đây là trường hợp duy nhất thoát trước khi vào REPL.

- [ ] **Step 1: Viết test thất bại**

```ts
test('dòng trống không gọi run', ...)
test('câu hỏi thành công → history có user + responseMessages', ...)
test('run ném lỗi 429 → history giữ nguyên độ dài cũ, in thông báo rate limit, trả continue', ...)
test('câu thứ 2 gửi kèm history của câu 1', ...)                // run nhận history có 2 user message
test('/steps 2 → lần run sau nhận maxSteps 2; /steps abc → không đổi', ...)
test('/reset xoá history', ...)
test('/exit → "exit"', ...)
test('describeApiError mạng → "Không kết nối được tới Gemini"', ...)
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npx vitest run test/session.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết `src/session.ts` và `src/cli.ts`**

- [ ] **Step 4: Chạy để thấy đạt**

Run: `npx vitest run test/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Chạy thật**

Run: `npm start`. Hỏi lần lượt "Chấm bài của Nam" (bấm y), rồi "So với bài của Lan thì ai tốt hơn?".
Expected:
- Câu 1 có ≥ 3 lượt gọi tool và dòng tổng có chi phí.
- Câu 2 hiểu "Nam và Lan" từ lịch sử, có `cache` > 0 hoặc `n/a` theo đúng spike, và `run_tests` của Nam báo `CACHE HIT` nếu model gọi lại.

- [ ] **Step 6: Commit**

```bash
git add src/session.ts src/cli.ts test/session.test.ts
git commit -m "feat: REPL với lịch sử, lệnh /steps /reset /cost và xử lý lỗi API"
```

---

### Task 9: Bộ đánh giá `npm run eval`

**Files:**
- Create: `src/eval.ts`
- Test: `test/eval.test.ts`

**Interfaces:**
- Consumes: `runQuestion` (Task 7), `createTools` + `autoApprove` (Task 4/5), `buildSystemPrompt`, `createLogger` (Task 6).
- Produces:

```ts
export type Golden = Record<string, { score: number; mustMention: string[] }>;
export type Outcome = { student: string; aiScore: number | null; answer: string; costUsd: number };
export type EvalRow = Outcome & { goldScore: number; diff: number | null; mentionsOk: boolean; missing: string[] };
export type EvalReport = { rows: EvalRow[]; mae: number | null; within1Pct: number; mentionPct: number; noScore: string[]; totalCostUsd: number };
export function scoreEval(golden: Golden, outcomes: Outcome[]): EvalReport;
export function extractScore(steps: StepLog[]): number | null; // input.score của lần gọi save_grade cuối cùng có output {status:'saved'}
```

- `mae` tính trên các hàng có `aiScore`; `null` nếu không có hàng nào.
- `within1Pct` và `mentionPct` tính trên tổng số học viên trong golden.
- `mentionsOk` kiểm tra mỗi regex trong `mustMention` (cờ `i`) có khớp với `answer` cộng chuỗi JSON của tool input `comments`.
- Phần `main`:
  - Với mỗi học viên trong golden, chạy `runQuestion` với `history = [{role:'user', content: 'Chấm bài của <student>'}]` và `autoApprove`. `gradesFile` là `data/grades-eval.json`, cache dùng chung `.cache/tests.json`.
  - Chạy lần lượt, nghỉ 4s giữa các học viên để tránh rate limit.
  - Lỗi API ở một học viên thì ghi là không có điểm, không dừng cả bộ.
  - In bảng bằng `console.table` và các chỉ số tổng.

- [ ] **Step 1: Viết test thất bại**

```ts
test('scoreEval: lệch [0,1,3] → mae 1.33, within1Pct 66.7', ...)
test('scoreEval: aiScore null → vào noScore, không tính vào mae', ...)
test('scoreEval: mustMention "rỗng|empty" khớp "Empty array" → mentionsOk', ...)
test('extractScore lấy save_grade saved cuối, bỏ qua rejected', ...)
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npx vitest run test/eval.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết `src/eval.ts`**

- [ ] **Step 4: Chạy để thấy đạt**

Run: `npx vitest run test/eval.test.ts`
Expected: PASS.

- [ ] **Step 5: Chạy thật**

Run: `npm run eval`
Expected: bảng 5 dòng, có MAE và tổng chi phí; `data/grades.json` không bị đổi.

- [ ] **Step 6: Commit**

```bash
git add src/eval.ts test/eval.test.ts
git commit -m "feat: bộ đánh giá so điểm AI với điểm giáo viên"
```

---

### Task 10: README + tập dượt kịch bản video

**Files:**
- Create: `README.md`

- [ ] **Step 1: Viết README**

README gồm:
- Bài toán.
- Bảng 7 yêu cầu → file/hàm đáp ứng (lấy từ spec mục 1).
- Cài đặt: `npm i`, tạo key ở Google AI Studio, `cp .env.example .env`.
- Các lệnh `npm start`, `npm run eval`, `npm test`, `/steps`, `/reset`, `/cost`.
- Kết quả spike về cache.
- Cảnh báo rằng sandbox không phải sandbox bảo mật.
- Kịch bản demo (spec mục 9).

- [ ] **Step 2: Chạy toàn bộ test**

Run: `npm test`
Expected: tất cả PASS.

- [ ] **Step 3: Tập dượt đúng kịch bản spec mục 9**

Run: `npm start` và đi đủ các bước. Expected:
- "Chấm bài của Hùng" → log `TIMEOUT 3s`, model giải thích, REPL vẫn chạy.
- "Chấm bài của Tuấn" → `✖ … student_not_found`, model gọi `list_submissions` rồi báo không có.
- `/steps 2` + "Chấm bài của Minh" → dòng `⚠ Đã dùng hết 2/2 lượt`.
- Bấm `n` khi duyệt → model báo chưa lưu.

Ghi lại bước nào lệch kịch bản và sửa trước khi quay.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README và hướng dẫn demo"
```
