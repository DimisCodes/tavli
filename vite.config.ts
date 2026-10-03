import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { jevProxyPlugin } from './server/vite-jev-plugin.ts';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // The dev and preview servers mount the same proxy handler the deployed site uses, so the
    // OpenRouter key is read server-side in every environment and never reaches the bundle.
    jevProxyPlugin(mode, loadEnv),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tavli · play against Jev',
        short_name: 'Tavli',
        description: "Tavli, Greek backgammon, played against Jev, TypeSafe's System One decision model.",
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // The board only works sideways, so an installed app opens that way and stays there.
        // Browsers that ignore this (Safari) fall back to the rotate prompt in the app.
        orientation: 'landscape',
        background_color: '#0c0b09',
        theme_color: '#0c0b09',
        categories: ['games', 'board'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          // The artwork sits inside the central 80% safe zone, so the same file serves as maskable.
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // API and health routes must never be answered with the app shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/healthz$/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Jev decisions are live and cost money; they are never served from a cache. Workbox
          // only routes GETs by default and these are POSTs, so this is belt and braces.
          { urlPattern: /\/api\/jev\//, handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
}));
