# Harness chấm bài lập trình JavaScript

Trợ lý (dòng lệnh và giao diện web) giúp giáo viên chấm bài JavaScript theo rubric: đọc đề và bài nộp, chạy test trong tiến trình con có timeout, đề xuất điểm kèm nhận xét, và chỉ lưu điểm khi giáo viên duyệt.

Bài tập buổi 2 · Xây dựng harness. Dựng bằng [Vercel AI SDK](https://ai-sdk.dev) (`ai` v7) + Google Gemini (free tier).

## Yêu cầu của đề → nơi đáp ứng

| # | Yêu cầu | Ở đâu |
|---|---|---|
| 1 | ≥ 2 tool tự viết | `src/tools.ts`: `list_submissions`, `read_file`, `run_tests`, `save_grade` |
| 2 | Agent loop nhiều lượt | `src/agent.ts` → `runQuestion()` (`generateText` + `stopWhen`) |
| 3 | Giới hạn lượt, lượt cuối trả lời bằng thông tin đã có | `stepCountIs(maxSteps)` + `prepareStep` đặt `toolChoice: 'none'` và thêm `LAST_STEP_NOTE` ở lượt cuối |
| 4 | Câu sau dựa vào câu trước | `src/session.ts`: `history` chỉ nối thêm, giữ cả tool call/result (`result.responseMessages`) |
| 5 | Cache hit từ câu thứ 2 | Lớp 1: prompt cache của Gemini (`cache …` mỗi lượt). Lớp 2: `src/toolCache.ts` cache kết quả `run_tests` theo sha256 → `CACHE HIT` |
| 6 | Log từng lượt + chi phí mỗi câu | `src/logger.ts` (terminal + `logs/*.jsonl`), `src/pricing.ts` |
| 7 | Lỗi không làm dừng harness | Tool: `safeTool()` trả lỗi cho model. Loop: ép trả lời ở lượt cuối. API: `session.ts` bắt lỗi, gỡ câu hỏi khỏi lịch sử, báo rõ |
| + | Nâng cao | Duyệt trước khi ghi điểm (`src/approval.ts`, nút Duyệt/Từ chối trên web) · bộ đánh giá so với điểm giáo viên (`eval/golden.json`) · giao diện web localhost |

## Cài đặt

Cần Node ≥ 24 (chạy thẳng file `.cts` của test runner) và pnpm.

```bash
pnpm install
cp .env.example .env
```

Tạo API key miễn phí tại <https://aistudio.google.com/apikey> và điền vào `GOOGLE_GENERATIVE_AI_API_KEY` trong `.env`.

## Sử dụng

```bash
pnpm start       # trò chuyện với trợ lý chấm bài
pnpm eval       # chấm cả 5 bài mẫu và so với điểm giáo viên
pnpm test       # unit test
pnpm spike      # kiểm tra prompt cache và giới hạn lượt trên Gemini thật
```

Lệnh trong phiên chat:

| Lệnh | Tác dụng |
|---|---|
| `/steps N` | Đổi giới hạn lượt mỗi câu hỏi (1–20), không mất lịch sử |
| `/reset` | Xoá lịch sử hội thoại |
| `/cost` | Tổng token và chi phí quy đổi của cả phiên |
| `/exit` | Thoát |

## Giao diện web

```bash
pnpm web         # build giao diện rồi chạy server tại http://127.0.0.1:3000 (cần API key)
pnpm web:mock    # như trên nhưng dùng model giả — thử giao diện khi chưa có key, không gọi Gemini
```

Trang có 3 tab:
- **Chấm bài:** chat bên trái; log từng lượt bên phải (tool, input, kết quả, token, cache, chi phí). Khi model gọi `save_grade`, hiện thẻ **Duyệt / Từ chối** có đếm ngược 5 phút, hết giờ thì tự từ chối. Thanh dưới có ô chọn lượt tối đa (thay `/steps`), nút xoá lịch sử (thay `/reset`) và tổng chi phí phiên (thay `/cost`).
- **Đánh giá:** chạy bộ đánh giá; kết quả từng học viên hiện dần, xong có MAE, % lệch ≤ 1, % nêu đủ lỗi, tổng chi phí.
- **Bảng điểm:** các điểm đã duyệt (`data/grades.json`), tự làm mới khi có điểm mới.

F5 hoặc mất kết nối giữa chừng đều không mất trạng thái: trang tải lại snapshot từ server, rồi nhận tiếp sự kiện qua SSE.

Phát triển giao diện (tự tải lại khi sửa code), chạy ở hai terminal:

```bash
pnpm web:api     # server, tự khởi động lại khi sửa src/
pnpm web:ui      # Vite dev server tại http://localhost:5173
```

**Kiến trúc:** `src/web/` (server Hono) bọc phần lõi qua `webSession.ts` và phát sự kiện SSE. Giao diện ở `web/` (React + TypeScript + TanStack Query). Hai bên dùng chung kiểu dữ liệu và **cùng một reducer** (`src/shared/`), nên server và giao diện luôn hiểu sự kiện giống nhau.

**Các lớp bảo mật** (`src/web/security.ts`, `server.ts`):
- Server chỉ lắng nghe `127.0.0.1`; API key chỉ nằm ở server.
- Header `Host` phải là localhost đúng cổng, chống DNS rebinding.
- Mọi POST phải có `Origin` của chính trang và `Content-Type: application/json`, nên website khác không gọi API được (chống CSRF).
- CSP `default-src 'self'` và các header bảo mật; giới hạn body 16 KB.
- Mọi input kiểm tra bằng zod; mỗi lúc chỉ chạy một việc (bận thì trả 409).
- Yêu cầu duyệt có id ngẫu nhiên, chỉ dùng được một lần.
- React escape nội dung, không dùng `dangerouslySetInnerHTML`: câu trả lời chứa HTML hiện nguyên văn.
- Lỗi trả cho trình duyệt không chứa stack trace.

## Dữ liệu mẫu

Bài `sum-array` (`data/assignments/sum-array/`) và 5 bài nộp (`data/submissions/sum-array/`):

| Học viên | Đặc điểm | Điểm GV |
|---|---|---|
| nam | Đúng hết, code sạch | 10 |
| lan | Trượt test mảng rỗng | 9 |
| an | Không ném TypeError, dùng `var` và biến toàn cục | 7 |
| hung | Vòng lặp vô hạn → timeout | 0 |
| minh | Lỗi cú pháp | 0 |

## Về cache và chi phí

- Free tier của Gemini trả $0. Log hiển thị **chi phí quy đổi** theo giá trả phí của Gemini 2.5 Flash (tra ngày 2026-11-02, xem `src/pricing.ts`).
- Trang giá của Google ghi context caching "Not available" ở free tier. Nếu Gemini không báo token cache, log ghi `cache n/a`; khi đó bằng chứng cache hit là dòng `CACHE HIT` của `run_tests`.
- Kết quả kiểm chứng trên API thật: `docs/superpowers/spike-results.md`.

## Giới hạn

- `run_tests` chỉ chạy bài trong **tiến trình con có timeout 3s**. Đây **không phải sandbox bảo mật**: bài nộp vẫn có toàn quyền của tiến trình Node. Chỉ dùng với bài nộp tin cậy (như dữ liệu mẫu).
- Mỗi lần chỉ chấm một bài tập (`sum-array`).
- Web UI dành cho **một người dùng trên chính máy chạy server**: không có đăng nhập, mọi tab mở cùng lúc dùng chung một phiên.

## Kịch bản demo (≤ 5 phút)

| Thời gian | Nội dung | Thao tác |
|---|---|---|
| 0:00–0:30 | Giới thiệu bài toán | Cấu trúc thư mục, đề, rubric |
| 0:30–1:30 | Câu bình thường | "Chấm bài của Nam" → log từng lượt, duyệt (`y` trên CLI hoặc nút **Duyệt** trên web), dòng tổng chi phí |
| 1:30–2:15 | Câu dựa vào câu trước | "So với bài của Lan thì ai tốt hơn?" → cache và `CACHE HIT` |
| 2:15–3:30 | Gây lỗi | "Chấm bài của Hùng" (timeout) → "Chấm bài của Tuấn" (không tồn tại) → `/steps 2` (web: chọn Lượt tối đa = 2) + "Chấm bài của Minh" (hết lượt) |
| 3:30–4:45 | Nâng cao | Từ chối duyệt; bộ đánh giá (`pnpm eval` hoặc tab **Đánh giá**) → bảng MAE |
| 4:45–5:00 | Kết | Link repo |

## Tài liệu thiết kế

- Spec: `docs/superpowers/specs/2026-11-02-grading-harness-design.md`
- Kế hoạch triển khai: `docs/superpowers/plans/2026-11-02-grading-harness.md`
- Web UI: `docs/superpowers/specs/2026-11-02-web-ui-design.md`, `docs/superpowers/plans/2026-11-02-web-ui.md`
