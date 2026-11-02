# REVIEW — video nộp bài (2:47)

## Quyết định

- Người dùng chọn **video quay màn hình** đúng thứ tự đề + **thuyết minh giọng nam** — không dựng storyline A/B/C trong `STORYLINES.md`.
- Hình là màn hình thật của `pnpm web:demo` (Gemini 2.5 Flash thật, Groq dự phòng), quay bằng `video/record/record.mjs` (CDP screencast ghép theo thời gian thật, 1920×1080, 30 fps). Lớp phủ chỉ có nhãn phần 1/5…5/5, chú thích ngắn trong khoảng trống dưới menu trái, phóng vào log/thẻ kết quả, huy hiệu "⏩ tua nhanh ×f" khi tăng tốc.
- Không nói "buổi 2" (bài tập cho cả hai buổi). Bỏ giọng đọc đoạn kết (thẻ link repo 4,5 s, không lời) theo yêu cầu.
- Đoạn 4 thuyết minh bằng `gemini-3.8-flash-lite-tts` (model TTS chính hết 10 lượt/ngày); cùng giọng "Charon" — chưa ai nghe so sánh.

## Đã đo / đã nhìn

- `hyperframes check`: ok (còn 2 cảnh báo `timeline_track_too_dense` ở s4/s5 — 4–5 chú thích trong một cảnh, giữ nguyên).
- Đã nhìn: bảng khung review + các khung 62 s (tổng chi phí câu 1), 84 s (cache 76 %), 118 s ("Đã dùng hết 2/2 lượt"), 148 s (cờ ⚠ + điểm AI), 158 s (học viên thấy 2/10).
- **Chưa nghe**: giọng đọc chỉ đo độ dài, không kiểm tra phát âm (máy không có Whisper).

## Yếu nhất

- s4 bắt đầu với trang Harness trống (quay lại sau khi khởi động server để có lời nhắc lượt cuối mới) — log đánh số lại "Câu #1". Lời đọc không nhắc lịch sử nên không sai, nhưng mạch hình hơi đứt.
- s2 và s4 chạy chậm ×0,7–0,74 để khớp lời đọc (gõ chữ hơi chậm), có giữ khung cuối vài giây.
- Groq dự phòng chỉ được nói, không hiện trên hình (hôm quay Gemini còn quota).
