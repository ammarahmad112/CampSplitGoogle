import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const isGhBundle = process.env.GH_PAGES_BUNDLE === '1';

  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: isGhBundle
      ? {
          outDir: 'gh-pages',
          emptyOutDir: true,
          rollupOptions: {
            input: path.resolve(__dirname, 'src/main.tsx'),
            output: {
              entryFileNames: 'app.js',
              chunkFileNames: 'chunk-[name].js',
              assetFileNames: (assetInfo) =>
                assetInfo.name && assetInfo.name.endsWith('.css') ? 'app.css' : 'asset-[name][extname]',
            },
          },
        }
      : undefined,
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
