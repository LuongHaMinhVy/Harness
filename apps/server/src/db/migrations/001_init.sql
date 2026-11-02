-- Thời gian lưu dạng epoch milliseconds (INTEGER).

CREATE TABLE users (
  id                   INTEGER PRIMARY KEY,
  username             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  full_name            TEXT    NOT NULL,
  role                 TEXT    NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  password_hash        TEXT    NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  disabled             INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE login_attempts (
  key          TEXT    PRIMARY KEY,
  failures     INTEGER NOT NULL,
  locked_until INTEGER
);

CREATE TABLE classes (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL
);

CREATE TABLE class_members (
  class_id   INTEGER NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE assignments (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL,
  rubric      TEXT    NOT NULL,
  entry_file  TEXT    NOT NULL,
  class_id    INTEGER NOT NULL REFERENCES classes (id),
  created_by  INTEGER NOT NULL REFERENCES users (id),
  due_at      INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE submissions (
  id            INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES users (id),
  version       INTEGER NOT NULL,
  files         TEXT    NOT NULL, -- JSON [{ path, size }]
  submitted_at  INTEGER NOT NULL,
  UNIQUE (assignment_id, student_id, version)
);

CREATE TABLE gradings (
  id            INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  status        TEXT    NOT NULL CHECK (status IN ('queued', 'running', 'done', 'error')),
  ai_score      REAL,
  ai_comments   TEXT,
  tests         TEXT,    -- JSON kết quả run_tests
  flags         TEXT,    -- JSON string[] cảnh báo
  error         TEXT,
  log_ref       TEXT,
  requested_by  INTEGER REFERENCES users (id),
  created_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX gradings_submission ON gradings (submission_id);

CREATE TABLE grades (
  submission_id INTEGER PRIMARY KEY REFERENCES submissions (id) ON DELETE CASCADE,
  score         REAL    NOT NULL,
  comments      TEXT    NOT NULL,
  grading_id    INTEGER REFERENCES gradings (id),
  edited        INTEGER NOT NULL DEFAULT 0,
  approved_by   INTEGER NOT NULL REFERENCES users (id),
  approved_at   INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id       INTEGER PRIMARY KEY,
  at       INTEGER NOT NULL,
  actor_id INTEGER REFERENCES users (id),
  action   TEXT    NOT NULL,
  target   TEXT,
  detail   TEXT
);
CREATE INDEX audit_at ON audit_log (at);
