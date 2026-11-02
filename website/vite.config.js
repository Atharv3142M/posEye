import { defineConfig } from 'vite';

export default defineConfig({
  base: '/posEye/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        technology: 'technology.html',
        reconstruction: 'reconstruction.html',
        product: 'product.html',
        research: 'research.html',
        releases: 'releases.html',
      },
    },
  },
});
