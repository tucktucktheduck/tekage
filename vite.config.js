import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    open: true,
    fs: { strict: false },
  },
  appType: 'mpa',   // ← multi-page app: disables SPA fallback so /library.html serves correctly
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main:    resolve(__dirname, 'index.html'),
        library: resolve(__dirname, 'library.html'),
      },
    },
  },
});
