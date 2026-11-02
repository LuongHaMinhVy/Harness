-- Nguồn bài nộp: tải file lên hoặc link GitHub (ghim commit lúc nộp).
ALTER TABLE submissions ADD COLUMN source TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'github'));
ALTER TABLE submissions ADD COLUMN repo_url TEXT;
ALTER TABLE submissions ADD COLUMN commit_sha TEXT;

-- Log kỹ thuật của mỗi lần AI chấm (từng lượt tool, token, chi phí) — giảng viên xem ở "Chi tiết kỹ thuật".
ALTER TABLE gradings ADD COLUMN steps TEXT;   -- JSON StepLog[]
ALTER TABLE gradings ADD COLUMN usage TEXT;   -- JSON { input, cached, output, costUsd, totalMs, hitLimit }
