import { defineConfig } from 'vite'
import { readFileSync } from 'fs'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

export default defineConfig({
  server: {
    proxy: {
      '/ktc-proxy': {
        target: 'https://keeptradecut.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ktc-proxy/, ''),
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/pwa-64x64.png',
        'icons/pwa-192x192.png',
        'icons/pwa-512x512.png',
        'icons/apple-touch-icon-180x180.png',
        'logos/*.png',
        'nfl-data-2026.json',
      ],
      manifest: {
        name: 'NFL Season Predictor',
        short_name: 'NFL Predictor',
        description: 'Predict NFL team win/loss records and playoff seedings for the 2026 season.',
        theme_color: '#1d4ed8',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globIgnores: ['**/*.map', 'icons/icon.svg'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          // Google Fonts stylesheet
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // Google Fonts files
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ESPN CDN images (headshots + team logos)
          {
            urlPattern: /^https:\/\/a\.espncdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'espn-cdn-images',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ESPN site API (rosters, stats, depth charts)
          {
            urlPattern: /^https:\/\/site\.api\.espn\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'espn-site-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ESPN web API (bio endpoint)
          {
            urlPattern: /^https:\/\/site\.web\.api\.espn\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'espn-web-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ESPN Core API ($ref URLs — upgraded to https in playerApi.js)
          {
            urlPattern: /^https:\/\/sports\.core\.api\.espn\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'espn-core-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
