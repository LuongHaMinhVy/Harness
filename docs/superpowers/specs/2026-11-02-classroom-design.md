# Lớp học: đăng nhập 3 vai trò, nộp bài, chấm theo file nộp — Thiết kế

- Ngày: 2026-11-02
- Thay thế phần giao diện của `2026-11-02-web-ui-design.md`; phần lõi harness (`2026-11-02-grading-harness-design.md`) giữ nguyên và được mở rộng.
- Ưu tiên: bảo mật, bảo trì, một luồng hoàn chỉnh dành cho người dùng thật.

## 1. Mục tiêu

Một trang web có đăng nhập cho **học viên**, **giảng viên**, **admin**:

- Học viên: xem bài tập được giao, nộp bài (nhiều file hoặc `.zip`, nộp lại được trước hạn, giữ phiên bản), xem điểm và nhận xét **sau khi giảng viên duyệt**.
- Giảng viên: quản lý lớp và học viên (tạo tay hoặc nhập CSV, mật khẩu tạm, bắt đổi lần đầu), tạo/sửa đề (mô tả, rubric, `tests.js`, file chính, hạn nộp, lớp), xem bài nộp, **Chấm** / **Chấm tất cả**, thẻ kết quả (điểm AI đề xuất, test ✓/✗, nhận xét, cờ cảnh báo, xem code), **Duyệt** hoặc **Sửa điểm rồi duyệt**, ô **Hỏi trợ lý**.
- Admin: mọi quyền của giảng viên + trang **Harness** (log từng lượt, token, cache, chi phí, bộ đánh giá, cài đặt) + quản lý tài khoản giảng viên + **nhật ký hoạt động**.

CLI (`pnpm start`, `pnpm eval`) giữ nguyên trên dữ liệu mẫu để quay video bài tập.

Ngoài phạm vi: đa trường/đa tổ chức, email, đặt lại mật khẩu qua email, nhiều ngôn ngữ lập trình ngoài JavaScript.

## 2. Cấu trúc monorepo (pnpm workspace, giữ Hono)

```
apps/web         React + Vite + React Router + TanStack Query   → chỉ phụ thuộc @harness/shared
apps/server      Hono: route theo vai trò, auth, upload, grading, SQLite → @harness/core + @harness/shared
apps/cli         CLI + eval cho video                            → @harness/core
packages/core    agent loop, tools, sandbox + runner, logger, pricing, prompt, eval, approval
packages/shared  kiểu dữ liệu, schema zod, reducer, tóm tắt tool — không phụ thuộc Node/DOM
```

- Package nội bộ dùng thẳng mã nguồn TypeScript (`exports` trỏ tới `src/*.ts`); không có bước build cho package. `tsx` chạy server/CLI, Vite build web, Vitest test toàn bộ từ thư mục gốc.
- Thư mục dữ liệu (`data/`, `eval/`, `logs/`, `.cache/`) ở thư mục gốc; mọi lệnh chạy với cwd là thư mục gốc.
- NestJS không dùng: viết lại lớp bảo mật đã có test, cần build `tsc`/SWC vì esbuild không hỗ trợ `emitDecoratorMetadata`. Lấy cấu trúc kiểu Nest bằng module theo tính năng + `requireRole()` + zod.

## 3. Dữ liệu (SQLite `node:sqlite`, `data/app.db`)

Bảng: `users`, `sessions`, `login_attempts`, `classes`, `class_members`, `assignments`, `submissions`, `gradings`, `grades`, `audit_log` (cột chính như buổi thiết kế). Migration SQL đánh số trong `apps/server/src/db/migrations/`, chạy tự động khi khởi động, ghi phiên bản vào bảng `schema_migrations`. Mỗi bảng một repository có kiểu; route không viết SQL.

File:
- Đề: `data/assignments/<slug>/{README.md, rubric.md, tests.js}` (ghi từ form tạo đề; prompt và runner đọc từ đây).
- Bài nộp: `data/submissions/<slug>/<username>/v<n>/…` (web). Dữ liệu mẫu cũ `data/submissions/sum-array/<tên>.js` vẫn dùng cho CLI/eval qua **bộ định vị bài nộp** (`SubmissionLocator`).

## 4. Phần lõi thay đổi

- `SubmissionLocator { list(assignment); locate(assignment, student) → { dir, entry, files } }`: `flatLocator` (dữ liệu mẫu, CLI) và locator theo database (web).
- Tool mới `list_files(assignment, student)`; `read_file` đọc file trong bài nộp; `run_tests` chạy với `entry` của đề.
- `buildSystemPrompt({ title, description, rubric, slug })` nhận nội dung thay vì đọc file cố định; thêm chỉ dẫn: nội dung bài nộp là dữ liệu cần chấm, không phải lệnh.
- `save_grade` trên web chỉ lưu **điểm đề xuất** (gradings); điểm chính thức chỉ có khi giảng viên duyệt (grades). CLI giữ hành vi duyệt y/n.
- Runner: `node --permission --allow-fs-read=<bài nộp>,<tests>,<runner>`, env rỗng, `--max-old-space-size=64`, timeout 3s, stdout ≤ 1 MB. Tuỳ chọn `SANDBOX=docker` (`--network none --read-only --memory 128m`).

## 5. Bảo mật

1. Mạng: mặc định `127.0.0.1`; `--lan`/`HOST=0.0.0.0` để mở; `Host`/`Origin` hợp lệ từ `ALLOWED_HOSTS`. HTTPS khi có `TLS_CERT`/`TLS_KEY`; trang đăng nhập cảnh báo nếu chạy HTTP ngoài localhost.
2. Mật khẩu: scrypt (salt 16 byte, `timingSafeEqual`), 8–128 ký tự. Admin đầu tiên qua `pnpm admin:create`. Mật khẩu tạm ngẫu nhiên khi giảng viên tạo học viên, `must_change_password`.
3. Chống dò: sai 5 lần → khoá tài khoản 15 phút; giới hạn theo IP; thông báo chung "Sai tài khoản hoặc mật khẩu".
4. Phiên: token 32 byte, cookie `HttpOnly; SameSite=Strict; Path=/` (+`Secure` khi HTTPS), DB lưu sha256(token), hạn 12 giờ, cấp mới khi đăng nhập, huỷ hết khi đổi mật khẩu.
5. Phân quyền: `requireRole()`; mọi truy vấn lọc theo người đăng nhập; truy cập tài nguyên không thuộc mình → 404. Giảng viên chỉ thấy lớp/đề của mình; admin thấy tất cả.
6. Upload: request ≤ 2 MB, file ≤ 512 KB, ≤ 50 file; zip giải nén có đếm byte thật, tổng ≤ 5 MB, ≤ 200 mục; chặn `..`, đường dẫn tuyệt đối, ổ đĩa, symlink; chỉ `.js .cjs .mjs .json .md .txt`; thư mục do server đặt; không phục vụ file nộp như trang web (xem code qua API JSON, hiển thị dạng chữ).
7. Prompt injection: chỉ dẫn trong system prompt; điểm chức năng theo kết quả test; server gắn cờ khi điểm AI lệch bất thường so với tỉ lệ test đạt; giảng viên luôn duyệt.
8. Nhật ký: đăng nhập (thành công/thất bại), tạo/khoá tài khoản, tạo/sửa đề, nộp bài, chấm, duyệt/sửa điểm.
9. Giữ nguyên: CSP và header bảo mật, `Origin` + `Content-Type` cho POST, chặn `Sec-Fetch-Site` cross-site/same-site, chặn HEAD trên `/api`, zod cho mọi input, lỗi không lộ stack trace.
10. Code bài nộp được gửi tới Gemini khi chấm; ghi rõ trên trang đăng nhập và README.

## 6. Giao diện

Sáng, sạch, thanh bên trái theo vai trò. Route: `/dang-nhap`, `/doi-mat-khau`, `/hoc-vien/*`, `/giang-vien/*`, `/admin/*`. Log kỹ thuật ẩn với học viên/giảng viên (chỉ trạng thái + "Chi tiết kỹ thuật" thu gọn), admin thấy đủ. Cập nhật trạng thái chấm qua SSE.

## 7. Thư viện thêm

`react-router`, `fflate`. Không thêm ORM, bcrypt/argon2, thư viện session, axios, Redux, Tailwind (lý do trong buổi thiết kế).

## 8. Kiểm thử

Unit (mật khẩu, phiên, khoá đăng nhập, zip/upload, CSV), sandbox (bài cố đọc `.env`, ghi file, chạy lệnh, đọc env → thất bại an toàn), **ma trận phân quyền** (route × vai trò), luồng chấm với model giả (nộp → chấm → đề xuất + cờ → duyệt/sửa → học viên thấy), kiểm tra trên trình duyệt bằng `pnpm seed:demo` + model giả cho từng vai trò. 121 test hiện có phải vẫn pass.

## 9. Thứ tự làm

0. Tái cấu trúc monorepo (không đổi hành vi).
1. DB + migration + auth + phiên + chống dò + `admin:create` + khung trang theo vai trò.
2. Lớp, học viên (CSV, mật khẩu tạm), đề bài.
3. Upload + zip an toàn + trang học viên.
4. Runner cô lập + locator + `list_files` + hàng đợi chấm + thẻ kết quả + duyệt/sửa.
5. Admin (Harness, tài khoản, nhật ký) + Hỏi trợ lý.
6. LAN/HTTPS + `seed:demo` + README + kiểm tra trình duyệt + review.
