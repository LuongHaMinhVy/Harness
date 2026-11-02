# Video nộp bài buổi 2 — ba hướng kể

Ràng buộc chung (từ đề): tối đa 5 phút, đúng thứ tự **giới thiệu → câu bình thường (log từng lượt + chi phí) → câu dựa vào câu trước → cố ý gây lỗi → phần nâng cao**. Mọi log, token, cache, chi phí trên màn hình lấy từ **một lần chạy thật** với Gemini 2.5 Flash (free tier) và ảnh chụp thật của web lớp học — không vẽ lại số liệu.

Giả định: 3½–4½ phút · 16:9 1920×1080 · 30 fps · nhạc nền nhẹ + tiếng gõ/tick trên thao tác · chữ tiếng Việt trên màn hình (thuyết minh giọng đọc: tuỳ chọn) · không có khoản trả phí.

---

## A. Một bài nộp đi hết đường (khuyên chọn)

**Device:** ví dụ chạy từ đầu tới cuối — một bài nộp thật (`nam.js`) đi qua harness. **Form:** chuỗi vật-nối-vật: mỗi cảnh kết thúc trên đúng thứ mở cảnh sau (file bài nộp → dòng `read_file` trong log → kết quả test → ô duyệt điểm → dòng chi phí).

Người xem thấy một buổi chấm bài thật của giảng viên: câu hỏi gõ vào, harness gọi tool từng lượt, rồi camera zoom đúng vào dòng log chứng minh từng yêu cầu (cache 90%, `$0.0033`, `⏳ đợi 15s`, "hết lượt"). Cảm giác: rõ ràng, có thật, như xem người khác làm bài.

- **2 giây đầu:** file `nam.js` (code thật) trượt vào khung "Bài nộp", dòng chữ lớn: _"Ai chấm 30 bài này?"_
- **Nhịp:** hook → bài toán (giáo viên + 5 bài, AI chấm phải có phanh và người duyệt) → câu 1 "Chấm bài của Nam" (log từng lượt, duyệt `y`, tổng chi phí) → câu 2 "So với bài của Lan…" (cache hit) → gây lỗi (Tuấn không tồn tại · `/steps 2` hết lượt · rate limit tự chờ) → nâng cao (duyệt trước khi ghi + web lớp học: nộp → Chấm → cờ → duyệt → học viên thấy điểm) → một câu chốt + link repo.
- **Look:** nền sáng của web lớp học, terminal sáng chữ mono, màu nhấn xanh dương của nút "Duyệt điểm"; khung đỏ chỉ cho lỗi.
- **Sound:** nhạc nền piano/lo-fi nhỏ, tiếng phím khi gõ câu hỏi, tick nhẹ khi mỗi lượt log xuất hiện.

## B. Bảy mảnh quanh một cái đầu

**Device:** vật thể là lời giải thích — sơ đồ 7 thành phần harness của buổi 1 (context, agent loop, tool, giới hạn, cache/chi phí, quyền, validation/observability) đặt quanh "mô hình". **Form:** một khung hình tự sắp xếp lại, không cắt cảnh.

Sơ đồ mọc dần; mỗi phần đề bài yêu cầu làm sáng đúng mảnh tương ứng, và log thật chạy trong mảnh đó (giới hạn → hết lượt; cache → dòng cache 90%). Cảm giác: người chấm thấy ngay bài làm ăn khớp với lý thuyết của khoá.

- **2 giây đầu:** một vòng tròn "Gemini" trơ trọi, dòng chữ _"Mô hình chỉ biết nói"_; bảy mảnh lần lượt gắn vào.
- **Nhịp:** hook → mô hình trơ → gắn tool + loop (câu 1 chạy bên trong) → context + cache (câu 2) → giới hạn + xử lý lỗi (lỗi) → quyền + validation (duyệt, web) → cả bảy mảnh sáng, câu chốt.
- **Look:** nền sáng, sơ đồ nét mảnh màu xám, mảnh đang nói tô màu nhấn; log hiện trong ô của mảnh.
- **Sound:** nhạc ambient chậm, tiếng "khớp" khi mỗi mảnh gắn vào.

## C. Hai màn hình, một sự thật (táo bạo)

**Device:** trước/sau — bên trái là thứ giảng viên thấy (web), bên phải là thứ harness làm (log). **Form:** chia đôi màn hình rồi gộp về một: mỗi yêu cầu, nửa chứng minh được nó phóng to chiếm cả khung.

Người xem luôn thấy cả "bề mặt" lẫn "ruột": nút Chấm được bấm bên trái thì các lượt tool chạy bên phải; khi cần chứng minh cache, nửa phải phóng to; khi duyệt điểm, nửa trái phóng to.

- **2 giây đầu:** màn hình chia đôi: trái nút "Chấm" đang được bấm, phải log `[lượt 1] 🔧 list_files` bật ra cùng lúc.
- **Nhịp:** hook → bài toán → câu 1 (hai nửa song song) → câu 2 (gộp về log) → lỗi (gộp về log, khung đỏ) → nâng cao (gộp về web) → câu chốt.
- **Look:** đường chia màu nhấn, hai nửa cùng nền sáng, nửa được gộp phóng mượt.
- **Sound:** nhạc nhịp vừa, tiếng "whoosh" nhỏ mỗi lần gộp.
