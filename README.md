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

Tạo admin đầu tiên — chọn một trong hai cách:

- Đặt `ADMIN_EMAIL` và `ADMIN_PASSWORD` trong `.env` rồi chạy `pnpm seed:demo` (tạo admin đăng nhập bằng email + dữ liệu demo). Tạo xong nên xoá `ADMIN_PASSWORD` khỏi `.env`.
- Hoặc `pnpm admin:create quantri "Quản trị"`: in mật khẩu tạm, bắt đổi ở lần đăng nhập đầu.

```bash
pnpm web                               # http://127.0.0.1:3000 — chỉ máy này truy cập được
```

Thử giao diện khi chưa có API key (model giả, database riêng `data/app-mock.db`, tự có dữ liệu demo — mật khẩu `demo-12345` cho `admin`, `gv.demo`, `nam`, `lan`, `an`, `hung`, `minh`):

```bash
pnpm web:mock
```

Dữ liệu demo cho database thật (admin từ `ADMIN_EMAIL`/`ADMIN_PASSWORD` nếu có, giảng viên `gv.demo`, lớp, 5 học viên, đề `sum-array`, 5 bài nộp): `pnpm seed:demo`.

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

- **Mật khẩu** băm scrypt; sai 5 lần trong 15 phút thì khoá tài khoản 15 phút (30 lần thì khoá theo IP); thông báo chung "Sai tài khoản hoặc mật khẩu".
- **Phiên** là cookie `HttpOnly; SameSite=Strict` (+ `Secure` khi HTTPS), database chỉ lưu hash của token; đổi mật khẩu thì huỷ mọi phiên cũ.
- **Phân quyền** kiểm tra phía server cho mọi truy vấn: học viên chỉ thấy bài/điểm của mình, giảng viên chỉ thấy lớp/đề của mình; truy cập trái phép trả 404; học viên học lớp của nhiều giảng viên thì chỉ admin đặt lại mật khẩu được.
- **Chặn request từ website khác**: kiểm tra `Host`, `Origin`, `Sec-Fetch-Site`, `Content-Type`; CSP `default-src 'self'`; giới hạn body (16 KB, riêng nộp bài 2 MB).
- **Upload**: ≤ 50 file, mỗi file ≤ 512 KB, chỉ `.js .cjs .mjs .json .md .txt`, chặn `..`/đường dẫn tuyệt đối/file ẩn; không nhận file nén. **GitHub**: chỉ gọi `api.github.com`/`codeload.github.com`, không theo redirect, repo ≤ 20 MB, giải nén có đếm byte thật.
- **Runner cô lập** (Node Permission Model): bài nộp chỉ đọc được thư mục của chính nó (không đọc được bộ test — test gửi qua stdin); không ghi file, không chạy lệnh/worker/inspector, không thấy biến môi trường (API key); intrinsic bị đóng băng và `assert` dùng chung bị khoá nên bài nộp không sửa được kết quả so sánh; kết quả chỉ nhận qua kênh riêng kèm mã ngẫu nhiên mỗi lần chạy nên không in kết quả giả được; giới hạn 3 giây, 1 MB output, heap 64 MB (Buffer không tính vào heap). **Mạng:** Node 24 chưa có quyền chặn mạng, runner chặn ở các API (`net`, `http`, `fetch`, `dgram`, `dns`) — đủ cho lớp học nội bộ; chấm bài của người lạ thì nên chạy server trong container không có mạng (`docker run --network none`).
- **Chống prompt injection**: system prompt coi code nộp là dữ liệu; điểm chức năng theo kết quả test; cờ cảnh báo; giảng viên luôn duyệt.
- **Dữ liệu gửi ra ngoài**: khi chấm, nội dung bài nộp được gửi tới API Gemini của Google (free tier có thể dùng dữ liệu để cải thiện sản phẩm). Database, đề và bài nộp tạo trên web (`data/app*.db`, `data/web/`, `data/web-mock/`) không đưa lên git; muốn làm lại từ đầu thì xoá cả database lẫn thư mục `data/web*` đi kèm.

## CLI

```bash
pnpm start       # trò chuyện với trợ lý chấm bài trên dữ liệu mẫu
pnpm eval        # chấm cả 5 bài mẫu và so với điểm giáo viên (`pnpm eval nam hung`: chỉ vài bài)
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
- **Prompt cache của Gemini có chạy ở free tier** (implicit caching, đo ngày 2026-11-02): phần đầu prompt (system prompt + đề + rubric + tool, ~1.300 token) trùng giữa các lượt nên từ lượt 2–3 trở đi log hiện `cache 736 · 49%`, `cache 1484 · 90%`. Vì vậy prompt không chèn giờ hay giá trị thay đổi, và lượt cuối nối lời nhắc vào **cuối** messages thay vì sửa system prompt. Lớp cache thứ hai là `CACHE HIT` của `run_tests`.
- Log tách **thinking token** (`out 499 (thinking 424)`) — Gemini 2.5 Flash tính thinking như output — và file `logs/*.jsonl` lưu nguyên khối usage gốc của provider.
- **Giới hạn free tier** (`gemini-2.5-flash`, đo ngày 2026-11-02): **20 lần gọi model mỗi ngày**, reset khoảng 15:00 giờ Việt Nam; một câu "Chấm bài của X" tốn ~5 lần gọi. Bị chặn theo phút thì harness tự chờ đúng thời gian Gemini yêu cầu rồi gọi lại lượt đó (`⏳ … đợi 15s`); hết quota ngày thì báo rõ, không treo.
- Phanh của mỗi câu hỏi: tối đa N lượt (`MAX_STEPS`, `/steps N`), 4.096 token output mỗi lượt, 120 giây cả câu, 3 giây mỗi lần chạy test.

## Kịch bản demo (≤ 5 phút) — vừa quota free tier

Free tier `gemini-2.5-flash` chỉ có **20 lần gọi/ngày** (reset ~15:00 giờ VN). Kịch bản dưới đây tốn khoảng **16 lần**, còn dư cho vài câu quay lại. Log in `Quota free tier hôm nay: N/20` sau mỗi câu để theo dõi.

| Thời gian | Nội dung | Thao tác | Lần gọi |
|---|---|---|---|
| 0:00–0:30 | Giới thiệu bài toán | Học viên nộp bài → AI đọc code, chạy test trong sandbox → đề xuất điểm → giảng viên duyệt | 0 |
| 0:30–1:30 | Câu bình thường | `pnpm start` (hoặc Admin → Harness): "Chấm bài của Nam" → log từng lượt (tool, input, kết quả, token, cache, thinking), bảng duyệt điểm, tổng chi phí | ~4 |
| 1:30–2:15 | Câu dựa vào câu trước | "So với bài của Lan thì ai tốt hơn?" (không nhắc lại Nam) → `cache … %` của Gemini, `CACHE HIT` | ~3–4 |
| 2:15–3:15 | Gây lỗi | "Chấm bài của Tuấn" (không có bài → tool báo lỗi, model giải thích) → `/steps 2` + "Chấm bài của Minh" (hết lượt → lượt cuối vẫn trả lời bằng thông tin đã có) | ~4–5 |
| 3:15–4:45 | Nâng cao | **Duyệt trước khi ghi** (đã thấy ở câu 1: `y`/`n`; thử `n` → điểm không lưu) · web lớp học: giảng viên bấm **Chấm** một bài → cờ cảnh báo → Sửa điểm rồi duyệt → học viên thấy điểm | ~4 |
| 4:45–5:00 | Kết | Link repo | 0 |

Mẹo khi chỉ có free tier:

- **Tập trước bằng model giả, không tốn quota:** `pnpm web:mock` → đăng nhập `admin` / `demo-12345` → trang Harness, hỏi đúng các câu trên.
- Ngày quay **không chạy** `pnpm spike` hay thử trước bằng Gemini. Không bấm "Chấm tất cả" với Gemini thật (5 bài ≈ 20 lần gọi).
- Bộ đánh giá chạy vào **ngày khác**, theo nhóm: `pnpm eval nam hung` (~8–10 lần gọi) rồi `pnpm eval lan an minh`; quay hoặc chụp bảng MAE để chèn vào phần nâng cao.
- Bị chặn theo phút thì harness tự chờ (`⏳ … đợi 15s`), cứ để nó chạy; hết quota ngày thì log báo rõ — cũng là một cảnh "xử lý lỗi" hợp lệ.

## Tài liệu thiết kế

- Harness: `docs/superpowers/specs/2026-11-02-grading-harness-design.md`
- Web lớp học: `docs/superpowers/specs/2026-11-02-classroom-design.md`, kế hoạch `docs/superpowers/plans/2026-11-02-classroom.md`
