/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 开发环境把 /api 转发给 NestJS，避免跨域
      // 用 127.0.0.1 而非 localhost：Windows 上 localhost 可能解析为 ::1，
      // 而 B2 整改后 API 默认只监听 IPv4 回环
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
