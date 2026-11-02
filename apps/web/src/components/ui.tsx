// Các mảnh giao diện nhỏ dùng chung: huy hiệu, khung lỗi, tiêu đề trang, nút sao chép, mật khẩu tạm (hiện một lần).
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../api.js';
import type { Tone } from '../lib/labels.js';

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge-pill ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Hiện lỗi từ server đúng nguyên văn, kèm danh sách lỗi theo trường nếu có. */
export function ErrorBox({ error, fieldLabels }: { error: unknown; fieldLabels?: Record<string, string> }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const issues = error instanceof ApiError ? error.issues : [];
  const extra = issues.filter((i) => i.message !== message || issues.length > 1);
  return (
    <div className="callout error" role="alert">
      <div>{message}</div>
      {extra.length > 0 && (
        <ul>
          {extra.map((i, n) => (
            <li key={n}>
              {i.path ? <strong>{fieldLabels?.[i.path] ?? i.path}: </strong> : null}
              {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Loading({ text = 'Đang tải…' }: { text?: string }) {
  return <p className="muted loading">{text}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** Hiện trạng thái truy vấn: đang tải / lỗi; có dữ liệu thì trả null để trang tự vẽ. */
export function QueryState({ isPending, error }: { isPending: boolean; error: unknown }) {
  if (error) return <ErrorBox error={error} />;
  if (isPending) return <Loading />;
  return null;
}

export function CopyButton({ text, label = 'Sao chép' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      window.prompt('Sao chép thủ công:', text);
    }
  };
  return (
    <button type="button" className="secondary small" onClick={() => void copy()}>
      {copied ? 'Đã chép ✓' : label}
    </button>
  );
}

/** Mật khẩu tạm — chỉ hiện một lần, có nút sao chép. */
export function TempPassword({ username, password, onClose }: { username: string; password: string; onClose?: () => void }) {
  return (
    <div className="callout ok temp-password" role="status">
      <div>
        Mật khẩu tạm của <strong>{username}</strong>: <code className="password">{password}</code> <CopyButton text={password} />
      </div>
      <p className="small muted">Chỉ hiện một lần — hãy gửi cho người dùng ngay. Họ sẽ phải đổi mật khẩu khi đăng nhập lần đầu.</p>
      {onClose && (
        <button type="button" className="link" onClick={onClose}>
          Đã lưu, ẩn đi
        </button>
      )}
    </div>
  );
}

/** Ô nhập có nhãn — giữ form gọn. */
export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
