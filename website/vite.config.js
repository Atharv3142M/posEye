import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/posEye/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        pipeline: resolve(__dirname, 'pipeline/index.html'),
        viewer: resolve(__dirname, 'viewer/index.html'),
        architecture: resolve(__dirname, 'architecture/index.html'),
        docs: resolve(__dirname, 'docs/index.html'),
        download: resolve(__dirname, 'download/index.html'),
        contact: resolve(__dirname, 'contact/index.html'),
      },
      output: {
        manualChunks: {
          three: ['three'],
          motion: ['gsap', 'lenis'],
        },
      },
    },
  },
});
