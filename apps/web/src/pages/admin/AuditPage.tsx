// Nhật ký hoạt động (mới nhất trước): ai, làm gì, với đối tượng nào, chi tiết.
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api.js';
import { Card, Empty, PageHeader, QueryState } from '../../components/ui.js';
import { formatDateTime } from '../../lib/dates.js';
import { auditLabel } from '../../lib/labels.js';
import { qk } from '../../queryKeys.js';

const detailText = (detail: unknown) => (detail === null || detail === undefined ? '' : JSON.stringify(detail));

export function AuditPage() {
  const { data, isPending, error, refetch, isFetching } = useQuery({ queryKey: qk.admin.audit, queryFn: adminApi.audit });
  const sorted = [...(data ?? [])].sort((a, b) => b.at - a.at || b.id - a.id);
  return (
    <>
      <PageHeader
        title="Nhật ký"
        subtitle="200 hoạt động gần nhất: đăng nhập, tài khoản, lớp, đề bài, nộp bài, chấm và duyệt điểm."
        actions={
          <button type="button" className="secondary" onClick={() => void refetch()} disabled={isFetching}>
            Tải lại
          </button>
        }
      />
      <Card>
        <QueryState isPending={isPending} error={error} />
        {data && data.length === 0 && <Empty>Chưa có hoạt động nào.</Empty>}
        {sorted.length > 0 && (
          <div className="table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người thực hiện</th>
                  <th>Hành động</th>
                  <th>Đối tượng</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.id} className={e.action === 'login_failed' ? 'row-warn' : undefined}>
                    <td className="nowrap">{formatDateTime(e.at)}</td>
                    <td>{e.actor ?? <span className="muted">—</span>}</td>
                    <td>{auditLabel(e.action)}</td>
                    <td>{e.target ?? ''}</td>
                    <td className="detail">
                      <code>{detailText(e.detail)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
