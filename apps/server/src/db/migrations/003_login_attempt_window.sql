-- Đếm lần đăng nhập sai trong một khung thời gian tính từ lần sai đầu, để lỗi gõ nhầm rải rác không cộng dồn mãi.
ALTER TABLE login_attempts ADD COLUMN first_failure_at INTEGER NOT NULL DEFAULT 0;
