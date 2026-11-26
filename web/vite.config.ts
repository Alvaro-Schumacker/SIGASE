import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Interface do SIGASE em React.
// - Em desenvolvimento (npm run dev), roda em http://127.0.0.1:5173/ e repassa
//   /api e /assets para o servidor Python (python server.py, porta 8000).
// - No build (npm run build), gera web/dist, servido pelo server.py na raiz (/).
//   Os arquivos gerados ficam em /app/ para não se misturar com as imagens em /assets/.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/assets': 'http://127.0.0.1:8000',
    },
  },
  build: { outDir: 'dist', emptyOutDir: true, assetsDir: 'app' },
});
