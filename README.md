# Harness chấm bài lập trình JavaScript

Trợ lý dòng lệnh giúp giáo viên chấm bài JavaScript theo rubric: đọc đề và bài nộp, chạy test trong tiến trình con có timeout, đề xuất điểm kèm nhận xét, và chỉ lưu điểm khi giáo viên duyệt.

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
| + | Nâng cao | Duyệt y/n trước khi ghi điểm (`src/approval.ts`) · bộ đánh giá `npm run eval` so với điểm giáo viên (`eval/golden.json`) |

## Cài đặt

Cần Node ≥ 20.

```bash
npm install
cp .env.example .env
```

Tạo API key miễn phí tại <https://aistudio.google.com/apikey> và điền vào `GOOGLE_GENERATIVE_AI_API_KEY` trong `.env`.

## Sử dụng

```bash
npm start        # trò chuyện với trợ lý chấm bài
npm run eval     # chấm cả 5 bài mẫu và so với điểm giáo viên
npm test         # unit test
npm run spike    # kiểm tra prompt cache và giới hạn lượt trên Gemini thật
```

Lệnh trong phiên chat:

| Lệnh | Tác dụng |
|---|---|
| `/steps N` | Đổi giới hạn lượt mỗi câu hỏi (1–20), không mất lịch sử |
| `/reset` | Xoá lịch sử hội thoại |
| `/cost` | Tổng token và chi phí quy đổi của cả phiên |
| `/exit` | Thoát |

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

## Kịch bản demo (≤ 5 phút)

| Thời gian | Nội dung | Thao tác |
|---|---|---|
| 0:00–0:30 | Giới thiệu bài toán | Cấu trúc thư mục, đề, rubric |
| 0:30–1:30 | Câu bình thường | "Chấm bài của Nam" → log từng lượt, duyệt `y`, dòng tổng chi phí |
| 1:30–2:15 | Câu dựa vào câu trước | "So với bài của Lan thì ai tốt hơn?" → cache và `CACHE HIT` |
| 2:15–3:30 | Gây lỗi | "Chấm bài của Hùng" (timeout) → "Chấm bài của Tuấn" (không tồn tại) → `/steps 2` + "Chấm bài của Minh" (hết lượt) |
| 3:30–4:45 | Nâng cao | Từ chối duyệt `n`; `npm run eval` → bảng MAE |
| 4:45–5:00 | Kết | Link repo |

## Tài liệu thiết kế

- Spec: `docs/superpowers/specs/2026-11-02-grading-harness-design.md`
- Kế hoạch triển khai: `docs/superpowers/plans/2026-11-02-grading-harness.md`
