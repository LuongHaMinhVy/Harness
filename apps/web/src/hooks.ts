import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

// Bọc một lệnh POST bằng TanStack Query: lỗi (409 đang bận, 400 sai input…) chuyển thành thông báo.
export function useAction<A extends unknown[]>(fn: (...args: A) => Promise<unknown>, onError: (message: string) => void) {
  const mutation = useMutation({ mutationFn: (args: A) => fn(...args), onError: (e: Error) => onError(e.message) });
  return (...args: A) => mutation.mutate(args);
}

// Thời điểm hiện tại, cập nhật định kỳ (để "còn 3 giờ" / "đã quá hạn" tự đổi mà không cần tải lại trang).
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
