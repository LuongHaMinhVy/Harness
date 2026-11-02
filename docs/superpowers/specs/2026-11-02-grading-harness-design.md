# Harness chấm bài lập trình JavaScript — Thiết kế

- Ngày: 2026-11-02
- Bối cảnh: Bài tập buổi 2 · Xây dựng harness. Hạn nộp 23:59 thứ Bảy 07/11/2026.
- Sản phẩm nộp: (1) video quay màn hình ≤ 5 phút, (2) link repo source code.

## 1. Mục tiêu

Một trợ lý dòng lệnh giúp giáo viên chấm bài lập trình JavaScript của học viên theo một rubric cố định: đọc đề và bài nộp, chạy test, đề xuất điểm kèm nhận xét, và lưu điểm sau khi giáo viên duyệt.

Harness phải thể hiện được trong video đủ 7 yêu cầu bắt buộc của đề cùng phần nâng cao:

| # | Yêu cầu của đề | Đáp ứng bằng |
|---|---|---|
| 1 | Tự viết ≥ 2 tool | 4 tool: `list_submissions`, `read_file`, `run_tests`, `save_grade` (mục 4) |
| 2 | Agent loop nhiều lượt | `generateText` + `stopWhen` (mục 5.1) |
| 3 | Giới hạn lượt, lượt cuối trả lời bằng thông tin đã có | `stepCountIs(N)` + `prepareStep` cấm tool ở lượt cuối (mục 5.1) |
| 4 | Lịch sử | Mảng `history` chỉ nối thêm (mục 5.2) |
| 5 | Cache hit từ câu thứ 2 | Prompt cache của Gemini + cache kết quả `run_tests` (mục 5.3, 5.4) |
| 6 | Log từng lượt + chi phí mỗi câu | `logger.ts`, `pricing.ts` (mục 6) |
| 7 | Xử lý lỗi, không dừng giữa chừng | 3 tầng: tool / loop / API (mục 7) |
| + | Nâng cao | Duyệt trước khi ghi điểm + bộ đánh giá `npm run eval` (mục 8) |

Ngoài phạm vi: giao diện web, nhiều đề bài cùng lúc, sandbox bảo mật thật, hỗ trợ ngôn ngữ khác ngoài JavaScript.

## 2. Quyết định đã chốt

- **Ngôn ngữ harness:** TypeScript chạy bằng Node (`tsx`).
- **Framework:** Vercel AI SDK core (`ai`, `@ai-sdk/google`, `zod`). **Không** dùng `HarnessAgent` / AI SDK Harnesses, vì lớp đó bọc agent có sẵn và giấu loop/cache, trái với mục đích bài tập.
- **Model:** Google Gemini qua free tier của Google AI Studio. Dùng bản Flash mới nhất còn trong free tier, chốt tên model khi tạo key và đặt trong biến môi trường `MODEL`.
- **Bài nộp của học viên:** JavaScript (CommonJS, `module.exports`).
- **Giao diện:** CLI dạng chat (REPL) trong terminal.
- **Cache:** 2 lớp, gồm prompt cache ngầm của Gemini và cache kết quả `run_tests` do harness tự quản lý.
- **Lưu ý với giảng viên:** đề ghi "dựa trên repo demo buổi 2". Việc đổi sang Vercel AI SDK cần được giảng viên chấp nhận; người làm bài tự xác nhận.

## 3. Cấu trúc thư mục

```
harness/
├─ data/
│  ├─ assignments/sum-array/
│  │  ├─ README.md          đề bài
│  │  ├─ rubric.md          tiêu chí + thang điểm 0–10
│  │  └─ tests.js           bộ test, xuất ra danh sách test case
│  ├─ submissions/sum-array/
│  │  ├─ nam.js             đúng hết
│  │  ├─ lan.js             trượt test mảng rỗng
│  │  ├─ an.js              đúng nhưng code kém (cho rubric phần chất lượng)
│  │  ├─ hung.js            vòng lặp vô hạn
│  │  └─ minh.js            lỗi cú pháp
│  └─ grades.json           điểm đã lưu
├─ eval/golden.json         điểm giáo viên chấm sẵn
├─ logs/                    session-<timestamp>.jsonl (gitignore)
├─ .cache/tests.json        cache kết quả run_tests (gitignore)
├─ src/
│  ├─ cli.ts                REPL, lệnh /steps /reset /cost, giữ history
│  ├─ agent.ts              runQuestion(): một câu hỏi = một lần generateText
│  ├─ prompt.ts             dựng SYSTEM_PROMPT (nhúng đề + rubric) và LAST_STEP_NOTE
│  ├─ tools.ts              4 tool + safeTool()
│  ├─ sandbox.ts            chạy test trong tiến trình con, timeout
│  ├─ test-runner.cjs       script chạy trong tiến trình con: nạp bài nộp, chạy tests.js
│  ├─ toolCache.ts          cache run_tests theo sha256
│  ├─ approval.ts           hỏi y/n trước khi ghi; có chế độ tự duyệt cho eval
│  ├─ logger.ts             in log từng lượt + tổng câu hỏi, ghi JSONL
│  ├─ pricing.ts            bảng giá quy đổi + hàm tính chi phí
│  └─ eval.ts               npm run eval
├─ .env.example             GOOGLE_GENERATIVE_AI_API_KEY=, MODEL=, MAX_STEPS=6
├─ package.json             scripts: start, eval
└─ README.md
```

Bài tập mẫu `sum-array`: viết hàm `sumArray(arr)` trả về tổng các phần tử số. Trả về 0 với mảng rỗng, ném `TypeError` nếu đầu vào không phải mảng. Bộ test có khoảng 5 test case.

## 4. Tool

Mọi đường dẫn được giải tương đối với `data/`. Mọi đường dẫn thoát ra ngoài `data/` đều bị từ chối.

| Tool | Input (zod) | Output thành công | Lỗi có thể trả |
|---|---|---|---|
| `list_submissions` | `{ assignment: string }` | `{ students: string[] }` | `assignment_not_found` |
| `read_file` | `{ path: string }` | `{ path, content }` (cắt ở 20.000 ký tự) | `not_found`, `outside_data_dir` |
| `run_tests` | `{ assignment: string, student: string }` | `{ status: "ok", passed, total, results: [{name, ok, error?}], cached, durationMs }` | `{ status: "timeout" }`, `{ status: "load_error", message }`, `student_not_found` |
| `save_grade` | `{ assignment, student, score: number 0–10, comments: string }` | `{ status: "saved" }` | `{ status: "rejected_by_user" }`, lỗi validate score |

**`safeTool(fn)`** bọc mọi `execute`. Ngoại lệ được bắt và chuyển thành `{ error: <mã>, message, hint? }`, rồi trả về cho model như dữ liệu, không bao giờ ném ra ngoài loop. Gợi ý `hint` hướng model tự sửa, ví dụ `"dùng list_submissions để xem tên hợp lệ"`.

**`run_tests` / `sandbox.ts`:** spawn `node src/test-runner.cjs <submission> <tests>` làm tiến trình con, timeout 3 giây. Hết hạn thì kill và trả về `timeout`. Runner in kết quả JSON ra stdout. Đây **không phải sandbox bảo mật**: chỉ dùng với bài nộp mẫu tự tạo, README ghi rõ điều này.

**`save_grade`:** gọi `approval.ts` trước khi ghi (mục 8.1). Ghi `{assignment, student, score, comments, savedAt}` vào `grades.json`; chấm lại thì ghi đè bản cũ.

## 5. Agent loop, lịch sử, cache

### 5.1 Loop và giới hạn lượt (`agent.ts`)

```ts
const result = await generateText({
  model: google(process.env.MODEL),
  system: SYSTEM_PROMPT,
  messages: history,
  tools,
  maxRetries: 2,
  stopWhen: stepCountIs(maxSteps),
  prepareStep: ({ stepNumber }) =>
    stepNumber === maxSteps - 1
      ? { toolChoice: 'none', system: SYSTEM_PROMPT + LAST_STEP_NOTE }
      : {},
  onStepFinish: logger.step,
});
```

- `maxSteps` mặc định lấy từ `MAX_STEPS` (6), đổi được trong phiên bằng `/steps N`.
- `LAST_STEP_NOTE`: "Đây là lượt cuối. Không gọi tool nữa. Trả lời ngay bằng thông tin đã thu thập và nói rõ phần nào chưa kiểm tra được."
- Nếu số lượt đã dùng bằng `maxSteps`, CLI in `⚠ Đã dùng hết N/N lượt — câu trả lời dựa trên thông tin hiện có`.
- **Cần kiểm chứng khi code:** khi `prepareStep` trả `system`, prompt cache ở lượt cuối có thể bị mất vì phần đầu prompt thay đổi. Chấp nhận được, vì chỉ ảnh hưởng một lượt. Nếu `prepareStep` không hỗ trợ đổi `system` trong phiên bản SDK đang dùng, thay bằng cách nối một user message chứa `LAST_STEP_NOTE` vào cuối `messages` của lượt đó.

### 5.2 Lịch sử (`cli.ts`)

- `history: ModelMessage[]` sống suốt phiên.
- Mỗi câu hỏi: push user message → `runQuestion` → nối `result.response.messages`. Phần này gồm các lượt gọi tool và kết quả tool, nên câu sau dùng lại được dữ liệu của câu trước.
- Không cắt lịch sử, để giữ phần đầu prompt ổn định cho cache. `/reset` xoá lịch sử.
- Khi `runQuestion` lỗi ở tầng API, gỡ user message vừa push ra khỏi `history` (mục 7).

### 5.3 Cache lớp 1: prompt cache của Gemini

- Implicit cache chỉ ăn khi phần đầu prompt trùng khớp và đủ dài (khoảng ≥ 1024 token với Flash).
- `SYSTEM_PROMPT` nhúng sẵn `README.md` và `rubric.md` của đề để phần cố định vượt ngưỡng. Không chứa thời gian hay giá trị thay đổi.
- Định nghĩa tool cố định và giữ nguyên thứ tự. Lịch sử chỉ nối thêm.
- Mỗi lượt log `usage.cachedInputTokens` / `usage.inputTokens`.
- **Rủi ro:** chưa xác nhận được free tier có báo số token cache không. Việc đầu tiên khi code là một spike: hỏi 2 câu liên tiếp và xem `cachedInputTokens`. Nếu luôn bằng 0 hoặc undefined, vẫn giữ log (hiện "n/a"), và lớp 2 đảm bảo yêu cầu 5.

### 5.4 Cache lớp 2: kết quả `run_tests` (`toolCache.ts`)

- Key là `sha256(nội dung bài nộp + nội dung tests.js)`.
- Lưu trong bộ nhớ và trong `.cache/tests.json`, nên khởi động lại vẫn còn.
- Chỉ cache kết quả `ok`, `load_error` và `timeout`, vì đều là kết quả xác định. Không cache lỗi hệ thống.
- Log ghi `MISS · 1.2s` hoặc `CACHE HIT (3fa2…) · 0s`. Bài nộp sửa thì hash đổi, cache tự mất hiệu lực.

## 6. Observability (`logger.ts`, `pricing.ts`)

Mỗi lượt in ra:

```
[lượt k] 🔧 <tool> <input JSON>
         → <tóm tắt kết quả, ≤ 200 ký tự> · <MISS/CACHE HIT> · <thời gian>
         tok in <input> (cache <cached> · <%>) · out <output>
```

Lượt không gọi tool in `💬 trả lời (<finishReason>)`. Lỗi tool in màu đỏ `✖ <tool> → <mã lỗi>`.

Cuối mỗi câu hỏi:

```
─ Tổng: <n> lượt · in <Σin> (cache <Σcached>) · out <Σout> · ≈ $<cost> (quy đổi) · <giây>s
```

- Chi phí = `(in − cached) × giá_in + cached × giá_cache + out × giá_out`.
- Giá mỗi triệu token lấy từ trang pricing chính thức của Google lúc implement, lưu trong `pricing.ts` kèm ngày tra cứu. Free tier thực trả $0, nên log ghi rõ "quy đổi".
- `/cost` in tổng của cả phiên.
- Mỗi lượt ghi một dòng JSONL đầy đủ (input, output tool không cắt, usage, thời gian) vào `logs/session-<timestamp>.jsonl`.

## 7. Xử lý lỗi

| Tầng | Tình huống | Hành vi | Người dùng thấy |
|---|---|---|---|
| Tool | Vòng lặp vô hạn | Kill sau 3s, trả `timeout` | `✖ run_tests hung → TIMEOUT 3s`; model giải thích |
| Tool | Lỗi cú pháp | Trả `load_error` + message | Model trích lỗi |
| Tool | File/học viên không tồn tại, path ra ngoài `data/` | Trả lỗi + `hint` | Model tự gọi `list_submissions` rồi báo |
| Tool | Input sai schema (vd. score 15) | AI SDK trả lỗi validate về cho model | `✖ save_grade → invalid input`; model sửa và gọi lại |
| Loop | Hết lượt | Lượt cuối `toolChoice: 'none'` | `⚠ Đã dùng hết N/N lượt…` |
| API | 429, lỗi mạng, sai/thiếu key | `maxRetries: 2`; vẫn lỗi thì bắt ở `cli.ts`, gỡ câu hỏi khỏi lịch sử | Thông báo tiếng Việt theo loại lỗi, rồi quay về dấu nhắc |

Nguyên tắc: không có lỗi nào làm thoát REPL. Chỉ `Ctrl+C` hoặc `/exit` mới thoát.

## 8. Nâng cao

### 8.1 Duyệt trước khi ghi (`approval.ts`)

`save_grade` dừng và hỏi qua readline:

```
⏸  Model muốn lưu: nam · 9/10 · "Đúng hết test, thiếu kiểm tra input không phải mảng"
   Duyệt? (y/n)
```

- `y`: ghi điểm, trả `saved`.
- `n`: không ghi, trả `rejected_by_user`; model báo lại và hỏi giáo viên muốn sửa thế nào.
- `eval.ts` dùng chế độ tự duyệt và ghi vào `grades-eval.json` thay vì `grades.json`.

### 8.2 Bộ đánh giá (`eval.ts`, `npm run eval`)

- `eval/golden.json`: `{ "<student>": { "score": number, "mustMention": string[] } }`.
- Với mỗi học viên: chạy `runQuestion("Chấm bài của <student>")` với lịch sử trống và tự duyệt. Lấy điểm từ lần gọi `save_grade`, và câu trả lời cuối để kiểm tra `mustMention` (so khớp chuỗi không phân biệt hoa thường).
- In bảng gồm học viên · điểm GV · điểm AI · lệch · nêu đủ lỗi? · chi phí. Cuối bảng có MAE, % bài lệch ≤ 1 điểm, % nêu đủ lỗi, tổng chi phí.
- Học viên không gọi `save_grade` (ví dụ hết lượt) bị tính là "không có điểm" và được liệt kê riêng.

## 9. Kịch bản video (≤ 5 phút)

| Thời gian | Nội dung | Thao tác |
|---|---|---|
| 0:00–0:30 | Giới thiệu bài toán | Cấu trúc thư mục, đề, rubric |
| 0:30–1:30 | Câu bình thường | "Chấm bài của Nam" → log từng lượt, duyệt `y`, dòng tổng chi phí |
| 1:30–2:15 | Câu dựa vào câu trước | "So với bài của Lan thì ai tốt hơn?" → % cache Gemini và `CACHE HIT` |
| 2:15–3:30 | Gây lỗi | "Chấm bài của Hùng" (timeout) → "Chấm bài của Tuấn" (không tồn tại) → `/steps 2` + "Chấm bài của Minh" (hết lượt) |
| 3:30–4:45 | Nâng cao | Từ chối duyệt `n`; `npm run eval` → bảng MAE |
| 4:45–5:00 | Kết | Link repo |

Lưu ý khi quay: free tier có giới hạn số request mỗi phút. Chạy thử kịch bản một lần trước để làm nóng cache, rồi quay với nhịp hỏi chậm.

## 10. Kiểm thử

- **Unit (vitest):** `sandbox.ts` (ok / timeout / load_error), `toolCache.ts` (hit, miss, đổi nội dung thì miss), chặn path trong `read_file`, `pricing.ts` (công thức chi phí), `safeTool` (ngoại lệ thành object lỗi).
- **Spike đầu tiên:** gọi Gemini 2 câu liên tiếp, xác nhận `cachedInputTokens` và xác nhận `prepareStep` với `toolChoice: 'none'` hoạt động.
- **Thủ công:** chạy đúng kịch bản video ở mục 9.
- **Chất lượng chấm:** `npm run eval`.
