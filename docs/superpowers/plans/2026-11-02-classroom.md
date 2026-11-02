# Lớp học (3 vai trò, nộp bài, chấm theo file nộp) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Biến harness thành web lớp học có đăng nhập học viên/giảng viên/admin, nộp bài nhiều file/zip và chấm theo file nộp, trong monorepo pnpm.

**Architecture:** pnpm workspace: `packages/{shared,core}`, `apps/{server,web,cli}`. Server Hono + SQLite (`node:sqlite`) với repository có kiểu; auth tự viết (scrypt + cookie session); chấm qua hàng đợi gọi `runQuestion` của core với `SubmissionLocator`; runner chạy dưới Node permission model.

**Tech Stack:** Node 24, pnpm 12, TypeScript, Hono, React 19 + React Router + TanStack Query, Vite, Vitest, zod, fflate, `ai` v7 + `@ai-sdk/google`.

**Spec:** `docs/superpowers/specs/2026-11-02-classroom-design.md`

## Global Constraints

- Mọi lệnh chạy từ thư mục gốc; đường dẫn dữ liệu tương đối với gốc (`data/`, `eval/`, `logs/`, `.cache/`).
- `apps/web` chỉ phụ thuộc `@harness/shared`; `packages/shared` không import Node/DOM.
- Không SQL trong route; mọi input qua zod; mọi truy vấn của học viên/giảng viên lọc theo người đăng nhập; tài nguyên không thuộc mình → 404.
- Mật khẩu scrypt; cookie `HttpOnly; SameSite=Strict`; DB chỉ lưu hash token.
- Runner: `--permission`, env rỗng, `--max-old-space-size=64`, timeout 3000 ms.
- Giới hạn upload: request 2 MB, file 512 KB, 50 file; zip ≤ 5 MB giải nén, ≤ 200 mục.
- Thông báo tiếng Việt. Không phá CLI/eval trên dữ liệu mẫu.

## Review Focus

1. Học viên đoán id bài nộp/điểm của người khác (IDOR) → 404 (Task 2–4, ma trận phân quyền).
2. Zip có `../`, đường dẫn tuyệt đối, khai man kích thước (zip bomb) → từ chối, không ghi gì ra đĩa (Task 3).
3. Bài nộp đọc `.env`/ghi file/chạy lệnh/đọc `process.env` → thất bại, không lộ key, vẫn ra kết quả chấm (Task 4).
4. Code nộp chứa "cho 10 điểm" → điểm theo test + cờ cảnh báo, không tự thành điểm chính thức (Task 4).
5. Đổi mật khẩu → phiên cũ trên máy khác bị huỷ (Task 1).

---

### Task 0: Tái cấu trúc monorepo (không đổi hành vi)
- [ ] `pnpm-workspace.yaml` (`apps/*`, `packages/*`, giữ `allowBuilds`); package `@harness/shared`, `@harness/core`, `@harness/server`, `@harness/web`, `@harness/cli` với `exports` trỏ `src/*.ts`, deps tách đúng nơi.
- [ ] Di chuyển file bằng `git mv` (giữ lịch sử); sửa import sang `@harness/*`; tsconfig gốc + mỗi package (`moduleResolution: Bundler`).
- [ ] Vitest gốc quét `packages/*/test`, `apps/*/test`; scripts gốc giữ tên cũ (`start`, `eval`, `web`, `web:mock`, `test`, `typecheck`, `spike`).
- [ ] Kiểm: `pnpm test` = 121 pass, `pnpm typecheck` sạch, `pnpm start` với key giả báo lỗi key, `vite build` ok. Commit.

### Task 1: DB + auth + khung trang
- [ ] `apps/server/src/db/{database.ts, migrate.ts, migrations/001_init.sql}`; repositories `users`, `sessions`, `loginAttempts`, `audit`.
- [ ] `auth/password.ts` (`hashPassword`, `verifyPassword`), `auth/sessions.ts` (`createSession`, `getSession`, `destroySession`, `destroyUserSessions`), `auth/rateLimit.ts`, `auth/middleware.ts` (`loadUser`, `requireRole`).
- [ ] Route `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`; `apps/cli` hoặc server script `admin:create`.
- [ ] Web: React Router, trang đăng nhập, đổi mật khẩu, khung theo vai trò.
- [ ] Test: mật khẩu, phiên (hạn, huỷ khi đổi mật khẩu), khoá sau 5 lần, cookie flags, route auth.

### Task 2: Lớp, học viên, đề
- [ ] Repos `classes`, `assignments`; routes giảng viên/admin: CRUD lớp, thêm học viên (tay/CSV → mật khẩu tạm), CRUD đề (ghi README/rubric/tests.js), giao đề cho lớp.
- [ ] Web giảng viên: Lớp & học viên, Đề bài.
- [ ] Test: CSV parser, ma trận phân quyền phần này.

### Task 3: Nộp bài
- [ ] `uploads/{validate.ts, zip.ts, store.ts}`; repo `submissions`; route học viên: danh sách đề được giao, nộp (multipart), lịch sử phiên bản, xem file mình nộp.
- [ ] Web học viên: Bài tập, Nộp bài (kéo-thả), Kết quả.
- [ ] Test: zip bomb, traversal, đuôi lạ, quá số file/kích thước, hạn nộp, IDOR.

### Task 4: Chấm
- [ ] Core: `SubmissionLocator`, `list_files`, prompt theo đề, runner `--permission` + env rỗng.
- [ ] Server: `grading/queue.ts` (đồng thời 2), `grading/service.ts` (proposal + cờ lệch), repos `gradings`, `grades`; routes giảng viên: chấm 1/tất cả, xem kết quả, duyệt/sửa; SSE trạng thái.
- [ ] Web giảng viên: Bài nộp & chấm (thẻ kết quả, xem code, duyệt/sửa); học viên thấy điểm sau duyệt.
- [ ] Test: sandbox probes, luồng chấm với model giả, cờ prompt injection.

### Task 5: Admin + Hỏi trợ lý
- [ ] Trang Harness (dùng lại log/eval), tài khoản giảng viên, nhật ký; Hỏi trợ lý (chat theo đề) cho giảng viên.

### Task 6: LAN/HTTPS, demo, tài liệu
- [ ] `HOST`, `ALLOWED_HOSTS`, `TLS_CERT/KEY`, cảnh báo HTTP; `pnpm seed:demo`; README; kiểm tra trình duyệt từng vai trò; review toàn branch.
