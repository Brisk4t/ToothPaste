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
        input: path.resolve(__dirname, 'index.html')
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    }
  }
});
