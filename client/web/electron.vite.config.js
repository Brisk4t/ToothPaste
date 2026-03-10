import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: path.resolve(__dirname, '../electron/main.js')
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, '../electron/preload.js')
      }
    }
  },
  renderer: {
    root: __dirname,
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        external: ['@stoprocent/noble'],
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        // SessionManager (client/core) imports 'elliptic', but node_modules
        // only exists in client/web. Provide an explicit alias so Rollup can
        // resolve it during the renderer production build.
        'elliptic': path.resolve(__dirname, 'node_modules', 'elliptic'),
      }
    },
    server: {
      fs: {
        allow: [
          path.resolve(__dirname, '..'), // allow all of client/
        ]
      }
    },
    optimizeDeps: {
      include: ['elliptic'],
      exclude: ['@stoprocent/noble'],
    },
  }
});
