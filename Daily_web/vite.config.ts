import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  base: process.env.VITE_PAGES_BASE || '/',
  plugins: [react()],
  server: {
    host: true,
    port: 4173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
}));
