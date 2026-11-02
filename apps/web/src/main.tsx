import type { User } from '@harness/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ApiError, configureApi } from './api.js';
import { App } from './App.js';
import { qk } from './queryKeys.js';
import './styles.css';

// Lỗi 4xx (sai quyền, không tìm thấy, sai input) không thử lại; lỗi mạng/5xx thử lại một lần.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

// Phiên hết hạn → xoá người dùng khỏi cache (RequireAuth chuyển về /dang-nhap và xoá dữ liệu cũ);
// phải đổi mật khẩu → đánh dấu để RequireAuth chuyển sang /doi-mat-khau.
configureApi({
  onUnauthorized: () => {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    queryClient.setQueryData(qk.me, null);
  },
  onMustChangePassword: () => queryClient.setQueryData<User | null>(qk.me, (u) => (u ? { ...u, mustChangePassword: true } : u)),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
