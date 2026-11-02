import { Link } from 'react-router';
import { useUser } from '../auth.js';
import { PageHeader } from '../components/ui.js';
import { roleHome } from '../lib/roles.js';

export function NotFoundPage() {
  const user = useUser();
  return (
    <>
      <PageHeader title="Không tìm thấy trang" subtitle="Đường dẫn không tồn tại hoặc bạn không có quyền xem." />
      <Link to={roleHome(user.role)} className="button">
        Về trang chính
      </Link>
    </>
  );
}
