import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'ToothPaste.png', 'ToothPaste.svg', 'ToothPaste.glb', 'ToothPaste_GLB.glb'],
      manifest: {
        name: 'ToothPaste Copy-Paste Web Application',
        short_name: 'ToothPaste App',
        description: 'Wireless clipboard synchronization via Bluetooth Low Energy',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        display_override: ['standalone', 'window-controls-overlay'],
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'ToothPaste.ico',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/x-icon',
            purpose: 'any maskable'
          },
          {
            src: 'ToothPaste.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'ToothPaste.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB limit
        globPatterns: ['**/*.{js,css,html,ico,png,svg,glb,json}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'dynamic-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    fs: {
      allow: [
        path.resolve(__dirname, '..'), // allow all of client/
      ]
    }
  },
  optimizeDeps: {
    include: ['elliptic'],
  },
});
