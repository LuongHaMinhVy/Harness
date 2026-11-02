import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Giao diện build ra apps/web/dist; server Hono (apps/server/src/main.ts) phục vụ thư mục này.
// Khi phát triển (`pnpm web:ui`), Vite chạy ở cổng 5173 và chuyển /api sang server ở cổng 3000.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3000' } },
  },
});
