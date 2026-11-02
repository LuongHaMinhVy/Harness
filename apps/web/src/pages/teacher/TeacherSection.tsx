// Bọc các trang giảng viên: mở một kết nối SSE trạng thái chấm, mỗi sự kiện làm mới đúng bảng/bài nộp liên quan.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { connectGradingEvents } from '../../api.js';
import { qk } from '../../queryKeys.js';

export function TeacherSection() {
  const client = useQueryClient();
  useEffect(
    () =>
      connectGradingEvents({
        onEvent: (e) => {
          void client.invalidateQueries({ queryKey: qk.teacher.submissions(e.assignmentId) });
          void client.invalidateQueries({ queryKey: qk.teacher.submission(e.submissionId) });
        },
      }),
    [client],
  );
  return <Outlet />;
}
