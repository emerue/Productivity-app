import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: { '@frog/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3080' },
  },
  build: {
    target: 'es2022',
  },
});
