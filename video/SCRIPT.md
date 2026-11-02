# Lời thuyết minh (bản nháp — số liệu chốt theo lần chạy thật)

Thứ tự theo đề: giới thiệu → câu bình thường (log từng lượt, chi phí) → câu dựa vào câu trước → cố ý gây lỗi → phần nâng cao. Tổng ≤ 5 phút. Hình là màn hình quay thật (web lớp học + trang Harness của admin, Gemini 2.5 Flash free tier).

## 1. Giới thiệu bài toán (~40 s) — màn hình: đăng nhập → danh sách bài nộp của đề sum-array

> Xin chào. Đây là bài tập buổi hai: xây dựng harness. Bài toán em chọn là chấm bài lập trình JavaScript. Học viên nộp code lên web lớp học; harness cho Gemini đọc code, chạy bộ test trong môi trường cô lập, rồi đề xuất điểm theo rubric. Giảng viên duyệt thì điểm mới thành chính thức. Harness viết bằng Vercel AI SDK, dùng Gemini 2.5 Flash bản miễn phí, với năm tool tự viết: liệt kê bài nộp, liệt kê file, đọc file, chạy test và lưu điểm.

## 2. Câu bình thường (~65 s) — trang Harness: "Chấm bài của Nam"

> Đầu tiên là một câu bình thường: chấm bài của Nam. Bên phải là log từng lượt. Mỗi dòng ghi tool nào được gọi, input là gì và kết quả ra sao. Mô hình xem bài gồm những file nào, chạy bộ test, đọc code, rồi gọi save_grade. Lưu điểm là thao tác ghi, nên harness dừng lại chờ em duyệt. Em bấm Duyệt. Cuối câu hỏi là tổng số lượt, token vào và ra, phần cache, và chi phí quy đổi theo bảng giá Gemini.

## 3. Câu dựa vào câu trước (~35 s) — "So với bài của Lan thì ai tốt hơn?"

> Câu tiếp theo em không nhắc lại tên Nam. Harness gửi lại toàn bộ lịch sử, nên mô hình hiểu đang so với Nam, dùng lại kết quả đã có và chỉ chấm thêm bài của Lan. Phần đầu prompt giống hệt lần trước, nên Gemini báo cache hit: phần lớn token đầu vào được tính giá rẻ.

## 4. Cố ý gây lỗi (~60 s) — "Chấm bài của Tuấn", rồi giới hạn 2 lượt + "Chấm bài của Minh"

> Giờ em cố ý gây lỗi. Lớp không có học viên tên Tuấn. Tool trả về lỗi kèm gợi ý; harness không dừng mà đưa lỗi lại cho mô hình, và mô hình báo rõ là không tìm thấy bài. Tiếp theo em hạ giới hạn xuống hai lượt rồi hỏi chấm bài của Minh. Ở lượt cuối, harness cấm gọi tool và nhắc mô hình trả lời bằng thông tin đã có. Log báo đã dùng hết hai trên hai lượt, nhưng người dùng vẫn nhận được câu trả lời rõ ràng.

## 5. Phần nâng cao (~80 s) — web lớp học: học viên nộp → giảng viên Chấm → cờ cảnh báo → duyệt → học viên thấy điểm

> Phần nâng cao có hai thứ. Thứ nhất là duyệt trước khi ghi, như vừa thấy. Thứ hai là web lớp học ba vai trò. Học viên An nộp lại bài; trong code có một dòng chú thích nhờ AI cho mười điểm. Giảng viên bấm Chấm. Mỗi lần chấm chỉ đọc được đúng bài đang chấm, và code chạy trong sandbox không đọc được file khác, không thấy API key. Kết quả có số test đạt, điểm đề xuất, và cờ cảnh báo vì bài có câu nhắm vào AI. Giảng viên sửa điểm rồi duyệt; lúc này học viên mới thấy điểm chính thức.

## 6. Kết (~10 s)

> Mã nguồn ở github chấm com, gạch chéo LuongHaMinhVy, gạch chéo Harness. Em cảm ơn thầy cô đã xem.
