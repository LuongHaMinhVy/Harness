# Web UI cho harness chấm bài — Thiết kế

- Ngày: 2026-11-02
- Bổ sung cho: `docs/superpowers/specs/2026-11-02-grading-harness-design.md` (phần lõi giữ nguyên).
- Tiêu chí chọn: bảo mật và dễ bảo trì.

## 1. Mục tiêu và phạm vi

Thêm giao diện web chạy trên máy (localhost) bên cạnh CLI, dùng lại toàn bộ phần lõi (`agent.ts`, 4 tool, sandbox, cache, logger, pricing, approval, session, eval).

Gồm 3 tab:
1. **Chấm bài:** chat bên trái, log từng lượt bên phải, thẻ Duyệt/Từ chối khi model gọi `save_grade`, điều khiển số lượt tối đa, xoá lịch sử, tổng chi phí phiên.
2. **Đánh giá:** chạy bộ đánh giá (`eval/golden.json`), hiện từng dòng khi xong, cuối cùng có MAE, % lệch ≤ 1, % nêu đủ lỗi, tổng chi phí.
3. **Bảng điểm:** đọc `data/grades.json`, tự làm mới khi có điểm mới được lưu.

Ngoài phạm vi: đăng nhập, nhiều người dùng, nhiều phiên song song, triển khai lên internet.

## 2. Quyết định đã chốt

- **Giao diện:** Vite + React + TypeScript (thư mục `web/`). React escape nội dung mặc định nên chống XSS; type sự kiện dùng chung với server.
- **Server:** Hono + `@hono/node-server`, một tiến trình, phục vụ API và file giao diện đã build (`web/dist`).
- **Đẩy dữ liệu thời gian thực:** Server-Sent Events (`GET /api/events`).
- **Một phiên, một việc mỗi lúc:** server giữ một `session` duy nhất; đang chạy câu hỏi hoặc eval thì yêu cầu mới trả 409.
- Không chọn HTML/JS thuần (dễ lỗi XSS, khó bảo trì) và không chọn Next.js (phải viết lại agent loop theo `streamText`, hai lõi song song).

## 3. Kiến trúc

```
src/shared/events.ts   HarnessEvent (union), StateSnapshot, schema zod cho body API — dùng chung server ↔ web
src/web/webApprover.ts Approver chờ bấm nút: Promise treo theo id, tự từ chối sau 5 phút
src/web/webSession.ts  điều phối: session + logger + approver + runEval → phát HarnessEvent; giữ transcript để vẽ lại
src/web/security.ts    middleware: Host chỉ localhost, kiểm tra Origin + Content-Type cho POST, header bảo mật/CSP
src/web/server.ts      createApp(deps): route Hono mỏng, validate bằng zod rồi gọi webSession
src/web/main.ts        điểm chạy thật: Gemini + .env, lắng nghe 127.0.0.1:PORT (mặc định 3000)
scripts/web-mock.ts    chạy createApp với model giả có kịch bản (thử giao diện khi chưa có API key)
web/                   Vite + React: main.tsx, App.tsx, api.ts, state.ts (reducer thuần), components/
```

Thay đổi duy nhất ở phần lõi: tách vòng lặp trong `src/eval.ts` thành `runEval(deps, hooks)` dùng chung cho CLI và web.

## 4. API

| Route | Body / trả về | Lỗi |
|---|---|---|
| `GET /api/events` | SSE, mỗi message là một `HarnessEvent` JSON | — |
| `GET /api/state` | `StateSnapshot` (transcript, thẻ duyệt đang chờ, busy, maxSteps, model, tổng phiên) | — |
| `POST /api/ask` | `{ question: string (1–2000) }` → `202 {ok:true}` | 400 sai input, 409 đang bận |
| `POST /api/approve` | `{ id: uuid, approved: boolean }` → `{ok:true}` | 400, 404 id không đang chờ |
| `POST /api/settings` | `{ maxSteps: int 1–20 }` → `{ok:true}` | 400 |
| `POST /api/reset` | → `{ok:true}` | 409 đang bận |
| `POST /api/eval` | → `202 {ok:true}` | 409 đang bận |
| `GET /api/grades` | `GradeRecord[]` (sắp theo tên học viên) | — |

`/api/settings` và `/api/reset` thay cho lệnh `/steps`, `/reset`; tổng chi phí nằm trong `StateSnapshot` và sự kiện `summary`, thay cho `/cost`.

## 5. Sự kiện SSE (`HarnessEvent`)

`question {n, text}` · `step {n, step: StepLog}` · `summary {n, steps, input, cached, output, costUsd, totalMs, hitLimit, maxSteps}` · `answer {n, text}` · `error {n, message}` · `approval {id, assignment, student, score, comments, expiresAt}` · `approval-resolved {id, approved, reason: 'user'|'timeout'}` · `grade-saved {student}` · `busy {busy, kind: 'ask'|'eval'|null}` · `eval-row {row, index, total}` · `eval-wait {student}` · `eval-done {report}` · `session {total}` (tổng phiên sau mỗi câu).

## 6. Bảo mật

1. Server chỉ lắng nghe `127.0.0.1`.
2. API key chỉ ở server (`.env`), không có trong bất kỳ response nào.
3. Header `Host` phải là `127.0.0.1:<port>` hoặc `localhost:<port>`; sai → 403 (chống DNS rebinding).
4. Mọi `POST`: `Origin` phải trùng `http://127.0.0.1:<port>` hoặc `http://localhost:<port>` (thêm `http://localhost:5173` chỉ khi `WEB_DEV=1`); thiếu/lạ → 403. `Content-Type` phải là `application/json`; sai → 415 (chống CSRF).
5. Header bảo mật qua `secureHeaders` của Hono; CSP `default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'`.
6. Giao diện không dùng `dangerouslySetInnerHTML`; câu trả lời hiển thị dạng text (`white-space: pre-wrap`).
7. Mọi body validate bằng zod (schema trong `src/shared/events.ts`).
8. Yêu cầu duyệt: id `crypto.randomUUID()`, dùng một lần, tự từ chối sau 5 phút.
9. Lỗi trả cho trình duyệt chỉ là thông báo đã qua `describeApiError`/thông báo cố định; không có stack trace.
10. Không có route đọc file tuỳ ý; `GET /api/grades` chỉ đọc đúng file điểm.
11. Giới hạn cũ giữ nguyên: chạy test bài nộp không phải sandbox bảo mật.

## 7. Giao diện

- Thanh đầu: tên, 3 tab, chấm trạng thái kết nối SSE + tên model.
- Tab Chấm bài: chat (câu hỏi, trả lời, thẻ duyệt có đếm ngược, thẻ lỗi) | log (mỗi câu một nhóm, mỗi lượt một khối; nhãn `CACHE HIT` xanh, `TIMEOUT`/lỗi đỏ, `⚠ hết lượt` vàng; input/output đầy đủ trong `<details>`); thanh dưới: ô chọn lượt tối đa, nút xoá lịch sử, tổng phiên.
- Tab Đánh giá: nút chạy, bảng dòng theo thời gian thực, 4 thẻ số liệu.
- Tab Bảng điểm: bảng học viên · điểm · nhận xét · thời điểm lưu; trạng thái rỗng có hướng dẫn.
- Kết nối lại SSE (tự động) và F5 đều gọi `GET /api/state` để vẽ lại.
- Màn hình hẹp (< 900px): chat và log xếp chồng.

## 8. Lệnh

| Lệnh | Việc |
|---|---|
| `pnpm web` | `vite build` rồi chạy `src/web/main.ts` |
| `pnpm web:mock` | `vite build` rồi chạy `scripts/web-mock.ts` (không cần API key) |
| `pnpm web:api` / `pnpm web:ui` | Phát triển: `tsx watch` server với `WEB_DEV=1` / Vite dev server cổng 5173, proxy `/api` |
| `pnpm typecheck` | `tsc -p .` và `tsc -p web` |

## 9. Kiểm thử

- `test/web/webApprover.test.ts`, `security.test.ts`, `server.test.ts`, `webSession.test.ts`, `test/runEval.test.ts`, `test/web/state.test.ts` — như mục "Test" đã duyệt trong buổi thiết kế.
- Kiểm tra giao diện thật bằng `pnpm web:mock` trong trình duyệt của app: hỏi → log → duyệt → bảng điểm; chạy eval; F5 giữ trạng thái.
