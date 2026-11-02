# SPEC — video nộp bài xây dựng harness (quay màn hình + thuyết minh)

Người dùng chọn: **video quay màn hình**, đúng thứ tự đề bài, **thuyết minh giọng nam** (Gemini TTS "Charon"). Không có storyline dựng hình — hình là màn hình thật của web lớp học, quay bằng `video/record/record.mjs` (Chrome 1536×864 phóng 125% → 1920×1080, 30 fps, con trỏ chuột vẽ trong trang).

## Khung

- 1920×1080, 30 fps, nền là chính bản quay (full-bleed). Tổng ≈ 2:45–3:30 (giới hạn đề: 5:00).
- 6 cảnh: `s1` giới thiệu · `s2` câu bình thường · `s3` câu dựa vào câu trước · `s4` cố ý gây lỗi · `s5` nâng cao · `s6` kết (thẻ link repo).
- Mỗi cảnh: bản quay của phần đó + giọng đọc bắt đầu sau 0,6 s + 1,2 s thở ở cuối. Tốc độ bản quay `f = độ dài quay / độ dài cảnh`, kẹp trong [0,7; 2,0]; `f > 1,15` thì hiện huy hiệu "⏩ ×f" (trung thực: đã tua nhanh).

## Lớp phủ (ít, chỉ để người chấm theo dõi)

- **Nhãn phần** giữa mép trên: `2/5 · Hỏi một câu bình thường` — chữ Inter 700 26 px, nền trắng 92 %, viền 1 px #d0d7e2, bo 999 px, đổ bóng 0 6 24 rgba(15,23,42,.12). Vào bằng trượt xuống 16 px + mờ dần 0,35 s `power3.out`, giữ suốt cảnh.
- **Chú thích** trong khoảng trống dưới menu trái của app (x 20, đáy 44, rộng 262 px — không che nội dung đang nói tới): thẻ trắng, vạch trái 6 px màu nhấn `#2563eb` (màu nút "Duyệt điểm" của app), chữ Inter 700 30 px `#0f172a`, xuống dòng; ≤ 8 từ; xuất hiện theo mốc thời gian thật của bản quay (file `.json`), giữ 3,2 s, vào 0,3 s / ra 0,25 s.
- **Phóng (punch-in)** vào vùng chứng minh: log bên phải (scale 1,32, gốc 97 % 96 % — log luôn cuộn xuống dòng mới nhất) khi câu trả lời xong ở s2/s3/s4; thẻ kết quả chấm (scale 1,38, gốc 97 % 32 %) ở s5. Vào 0,8 s `power2.inOut`, ra 0,6 s.
- **Mở đầu** (0–3,6 s, trên bản quay s1): thẻ giữa màn hình "Bài tập · Xây dựng harness" / "Chấm bài lập trình JavaScript · Gemini, Groq dự phòng" — Inter 900 64 px + 400 32 px, nền trắng 94 %.
- **Kết** (`s6`): nền `#f4f6fb` như app, "github.com/LuongHaMinhVy/Harness" Inter 900 56 px, dòng phụ "Harness chấm bài · Vercel AI SDK · Gemini 2.5 Flash + Groq dự phòng", không lời, giữ 4,5 s.

## Âm thanh

Chỉ giọng đọc (−16 LUFS ước lượng, volume 1). Không nhạc (nhạc miễn phí cần HeyGen CLI — đã hỏi/ghi chú). Không tiếng của bản quay.

## BANNED

Nền tối với UI trôi nổi; glow/particles; ba thẻ cạnh nhau; logo góc; chữ trôi/lắc sau khi đứng yên; vẽ lại số liệu không có trong bản quay; chèn số liệu vào chú thích (số chỉ có trong log thật).
