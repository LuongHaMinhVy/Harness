// Đường dẫn dữ liệu của harness, gom một chỗ để CLI, eval và web không ghi nhầm file của nhau.

export type AppPaths = {
  dataDir: string;
  gradesFile: string;
  evalGradesFile: string;
  cacheFile: string;
  logDir: string;
  goldenFile: string;
  /** Database SQLite của web lớp học. */
  dbFile?: string;
  /** Thư mục đề và bài nộp tạo trên web, đi cùng database (thiếu thì dùng dataDir). Tách khỏi dữ liệu mẫu của CLI. */
  webDir?: string;
};

export const APP_PATHS: AppPaths = {
  dataDir: 'data',
  gradesFile: 'data/grades.json',
  evalGradesFile: 'data/grades-eval.json',
  cacheFile: '.cache/tests.json',
  logDir: 'logs',
  goldenFile: 'eval/golden.json',
  dbFile: 'data/app.db',
  webDir: 'data/web',
};

// `pnpm web:mock` dùng file điểm riêng để điểm do model giả chấm không ghi đè điểm giáo viên đã duyệt.
export const MOCK_PATHS: AppPaths = {
  ...APP_PATHS,
  gradesFile: 'data/grades-mock.json',
  evalGradesFile: 'data/grades-eval-mock.json',
  dbFile: 'data/app-mock.db',
  webDir: 'data/web-mock',
};
