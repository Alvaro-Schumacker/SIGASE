import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Protótipo React do SIGASE.
// - Em desenvolvimento (npm run dev), roda em http://127.0.0.1:5173/novo/ e repassa
//   /api e /assets para o servidor Python (python server.py, porta 8000).
// - No build (npm run build), gera web/dist, servido pelo server.py em /novo/.
export default defineConfig({
  plugins: [react()],
  base: '/novo/',
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/assets': 'http://127.0.0.1:8000',
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
