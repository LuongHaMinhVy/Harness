import { useMutation } from '@tanstack/react-query';

// Bọc một lệnh POST bằng TanStack Query: lỗi (409 đang bận, 400 sai input…) chuyển thành thông báo.
export function useAction<A extends unknown[]>(fn: (...args: A) => Promise<unknown>, onError: (message: string) => void) {
  const mutation = useMutation({ mutationFn: (args: A) => fn(...args), onError: (e: Error) => onError(e.message) });
  return (...args: A) => mutation.mutate(args);
}
