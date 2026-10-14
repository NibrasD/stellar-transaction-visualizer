import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't empty dist folder (preserves SDK files)
  },
  server: {
    proxy: {
      '/api/stellar-expert': {
        target: 'https://api.stellar.expert',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/stellar-expert/, ''),
      },
    },
  },
});
