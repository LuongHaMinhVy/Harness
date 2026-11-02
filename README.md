# Harness chấm bài lập trình JavaScript

Web lớp học có đăng nhập cho **học viên**, **giảng viên**, **admin**: học viên nộp bài (file, cả thư mục hoặc link GitHub), AI chấm theo đúng các file đã nộp — đọc code, chạy test trong môi trường cô lập, đề xuất điểm kèm nhận xét — và **giảng viên duyệt** mới thành điểm chính thức. Kèm CLI để chạy harness trực tiếp.

Bài tập buổi 2 · Xây dựng harness. Dựng bằng [Vercel AI SDK](https://ai-sdk.dev) (`ai` v7) + Google Gemini (free tier), Hono, React, SQLite (`node:sqlite`).

## Yêu cầu của đề → nơi đáp ứng

| # | Yêu cầu | Ở đâu |
|---|---|---|
| 1 | ≥ 2 tool tự viết | `packages/core/src/tools.ts`: `list_submissions`, `list_files`, `read_file`, `run_tests`, `save_grade` |
| 2 | Agent loop nhiều lượt | `packages/core/src/agent.ts` → `runQuestion()` (`generateText` + `stopWhen`) |
| 3 | Giới hạn lượt, lượt cuối trả lời bằng thông tin đã có | `stepCountIs(maxSteps)` + `prepareStep` đặt `toolChoice: 'none'` và thêm `LAST_STEP_NOTE` ở lượt cuối |
| 4 | Câu sau dựa vào câu trước | `packages/core/src/session.ts`: `askWithHistory` chỉ nối thêm lịch sử, giữ cả tool call/result |
| 5 | Cache hit từ câu thứ 2 | Lớp 1: prompt cache của Gemini (`cache …` mỗi lượt). Lớp 2: `packages/core/src/toolCache.ts` cache kết quả `run_tests` theo sha256 → `CACHE HIT` |
| 6 | Log từng lượt + chi phí mỗi câu | `packages/core/src/logger.ts` (terminal + `logs/*.jsonl`), `pricing.ts`; trên web: trang **Harness** của admin và "Chi tiết kỹ thuật" của từng lần chấm |
| 7 | Lỗi không làm dừng harness | Tool: `safeTool()` trả lỗi cho model. Loop: ép trả lời ở lượt cuối. API: bắt lỗi, gỡ câu hỏi khỏi lịch sử, báo rõ; lần chấm lỗi được ghi lại, chấm lại được |
| + | Nâng cao | Giảng viên duyệt trước khi điểm thành chính thức · bộ đánh giá so với điểm giáo viên (`eval/golden.json`) · web lớp học 3 vai trò · runner cô lập · chống prompt injection |

## Cấu trúc (pnpm workspace)

```
apps/web         React + Vite + React Router + TanStack Query — giao diện
apps/server      Hono: đăng nhập, phân quyền, lớp/đề/bài nộp, chấm bài, SQLite
apps/cli         CLI (pnpm start) và bộ đánh giá (pnpm eval)
packages/core    agent loop, tool, runner cô lập, logger, prompt, eval
packages/shared  kiểu dữ liệu, schema zod, reducer — dùng chung server ↔ giao diện
```

## Cài đặt

Cần Node ≥ 24 và pnpm.

```bash
pnpm install
cp .env.example .env
```

Tạo API key miễn phí tại <https://aistudio.google.com/apikey> và điền vào `GOOGLE_GENERATIVE_AI_API_KEY` trong `.env`.

## Chạy web lớp học

```bash
pnpm admin:create quantri "Quản trị"   # tạo admin đầu tiên, in mật khẩu tạm (bắt đổi lần đầu)
pnpm web                               # http://127.0.0.1:3000 — chỉ máy này truy cập được
```

Thử giao diện khi chưa có API key (model giả, database riêng `data/app-mock.db`, tự có dữ liệu demo — mật khẩu `demo-12345` cho `admin`, `gv.demo`, `nam`, `lan`, `an`, `hung`, `minh`):

```bash
pnpm web:mock
```

Dữ liệu demo cho database thật (giảng viên `gv.demo`, lớp, 5 học viên, đề `sum-array`, 5 bài nộp): `pnpm seed:demo`.

### Luồng sử dụng

1. **Admin** tạo tài khoản giảng viên (mật khẩu tạm, giảng viên phải đổi lần đầu). Trang **Harness**: hỏi trợ lý tự do, xem log từng lượt, token, cache, chi phí, chạy bộ đánh giá. Trang **Nhật ký**: ai đăng nhập, ai duyệt/sửa điểm bài nào, lúc nào.
2. **Giảng viên** tạo lớp, thêm học viên (gõ từng người hoặc dán danh sách `username,họ tên`; hệ thống sinh mật khẩu tạm, chỉ hiện một lần), tạo đề (mô tả, rubric, `tests.js`, file chính, hạn nộp).
3. **Học viên** nộp bài: kéo-thả file, **chọn cả thư mục** (giữ cấu trúc thư mục con) hoặc **dán link GitHub** (repo public; hệ thống ghi lại đúng commit lúc nộp). Nộp lại trước hạn được, mỗi lần là một phiên bản.
4. Giảng viên bấm **Chấm** / **Chấm tất cả** → AI liệt kê file, đọc code, chạy test, đề xuất điểm + nhận xét, kèm **cờ cảnh báo** (điểm lệch so với tỉ lệ test đạt, bài có câu "dụ" AI, AI chưa chạy test…). Giảng viên **Duyệt** hoặc **Sửa điểm rồi duyệt**.
5. Học viên chỉ thấy **điểm chính thức** sau khi giảng viên duyệt.

### Mở cho cả lớp trong mạng LAN

```bash
pnpm web:lan        # lắng nghe mọi địa chỉ, tự nhận IPv4 của máy làm host hợp lệ
```

- Thêm tên máy khác qua `ALLOWED_HOSTS=cham-bai.lan,10.0.0.5`.
- **Nên bật HTTPS** khi mở LAN (nếu không, mật khẩu truyền không mã hoá): tạo chứng chỉ bằng [mkcert](https://github.com/FiloSottile/mkcert) rồi đặt `TLS_CERT=…pem` và `TLS_KEY=…pem` trong `.env`.

### Bảo mật

- **Mật khẩu** băm scrypt; khoá 15 phút sau 5 lần sai; thông báo chung "Sai tài khoản hoặc mật khẩu".
- **Phiên** là cookie `HttpOnly; SameSite=Strict` (+ `Secure` khi HTTPS), database chỉ lưu hash của token; đổi mật khẩu thì huỷ mọi phiên cũ.
- **Phân quyền** kiểm tra phía server cho mọi truy vấn: học viên chỉ thấy bài/điểm của mình, giảng viên chỉ thấy lớp/đề của mình; truy cập trái phép trả 404.
- **Chặn request từ website khác**: kiểm tra `Host`, `Origin`, `Sec-Fetch-Site`, `Content-Type`; CSP `default-src 'self'`; giới hạn body (16 KB, riêng nộp bài 2 MB).
- **Upload**: ≤ 50 file, mỗi file ≤ 512 KB, chỉ `.js .cjs .mjs .json .md .txt`, chặn `..`/đường dẫn tuyệt đối/file ẩn; không nhận file nén. **GitHub**: chỉ gọi `api.github.com`/`codeload.github.com`, không theo redirect, repo ≤ 20 MB, giải nén có đếm byte thật.
- **Runner cô lập** (Node Permission Model): bài nộp chỉ đọc được thư mục của chính nó; không ghi file, không chạy lệnh, không thấy biến môi trường (API key), giới hạn 64 MB RAM, 3 giây, 1 MB output. **Node 24 chưa chặn được mạng** — chấm bài của người lạ thì nên chạy server trong container không có mạng.
- **Chống prompt injection**: system prompt coi code nộp là dữ liệu; điểm chức năng theo kết quả test; cờ cảnh báo; giảng viên luôn duyệt.
- **Dữ liệu gửi ra ngoài**: khi chấm, nội dung bài nộp được gửi tới API Gemini của Google (free tier có thể dùng dữ liệu để cải thiện sản phẩm). Database, đề và bài nộp tạo trên web (`data/app*.db`, `data/web/`, `data/web-mock/`) không đưa lên git; muốn làm lại từ đầu thì xoá cả database lẫn thư mục `data/web*` đi kèm.

## CLI

```bash
pnpm start       # trò chuyện với trợ lý chấm bài trên dữ liệu mẫu
pnpm eval        # chấm cả 5 bài mẫu và so với điểm giáo viên
pnpm test        # toàn bộ unit test
pnpm typecheck   # kiểm tra kiểu cả 5 package
pnpm spike       # kiểm tra prompt cache và giới hạn lượt trên Gemini thật
```

Lệnh trong phiên chat: `/steps N` (giới hạn lượt 1–20), `/reset` (xoá lịch sử), `/cost` (tổng chi phí quy đổi), `/exit`.

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

- Free tier của Gemini trả $0. Log hiển thị **chi phí quy đổi** theo giá trả phí của Gemini 2.5 Flash (tra ngày 2026-11-02, xem `packages/core/src/pricing.ts`).
- Trang giá của Google ghi context caching "Not available" ở free tier; khi đó bằng chứng cache hit là dòng `CACHE HIT` của `run_tests`.

## Kịch bản demo (≤ 5 phút)

| Thời gian | Nội dung | Thao tác |
|---|---|---|
| 0:00–0:30 | Giới thiệu bài toán | Học viên nộp bài → AI chấm → giảng viên duyệt |
| 0:30–1:30 | Câu bình thường | Admin → Harness: "Chấm bài của Nam" → log từng lượt, duyệt, chi phí (hoặc CLI `pnpm start`) |
| 1:30–2:15 | Câu dựa vào câu trước | "So với bài của Lan thì ai tốt hơn?" → cache và `CACHE HIT` |
| 2:15–3:30 | Gây lỗi | "Chấm bài của Hùng" (timeout) → "Chấm bài của Tuấn" (không tồn tại) → Lượt tối đa = 2 + "Chấm bài của Minh" (hết lượt) |
| 3:30–4:45 | Nâng cao | Học viên nộp bài (thư mục/GitHub) → giảng viên Chấm tất cả → cờ cảnh báo → Sửa điểm rồi duyệt; bộ đánh giá → MAE |
| 4:45–5:00 | Kết | Link repo |

## Tài liệu thiết kế

- Harness: `docs/superpowers/specs/2026-11-02-grading-harness-design.md`
- Web lớp học: `docs/superpowers/specs/2026-11-02-classroom-design.md`, kế hoạch `docs/superpowers/plans/2026-11-02-classroom.md`
