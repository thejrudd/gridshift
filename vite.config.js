import { defineConfig } from 'vite'
import { resolve as resolvePath } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'
import { parseAppRoute } from './src/utils/appRoutes.js'
import { getPageShareMetadata, renderPageShareMetadataHtml } from './src/utils/pageShare.js'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))
const appVersion = process.env.GRIDSHIFT_APP_VERSION_OVERRIDE ?? version
const shareData = JSON.parse(readFileSync('./public/nfl-data-2026.json', 'utf8'))
const shareSeason = shareData.season ?? 2026
const shareTeams = shareData.teams ?? []
const STATIC_SHARE_ROUTES = [
  '/predictions',
  '/predictions/standings',
  '/predictions/playoffs',
  '/fantasy/rosters',
  '/fantasy/rankings',
  '/fantasy/live',
  '/fantasy/matchups',
  '/fantasy/waivers',
  '/fantasy/heatmap',
  '/fantasy/defenses',
  '/fantasy/scoring',
  '/league/standings',
  '/league/history',
  '/league/activity',
  '/statistics',
  '/statistics/schedule',
  '/statistics/scores',
  '/statistics/standings',
  '/trade/agent',
  '/trade/intelligence',
  '/trade/upgrade',
  '/trade/history',
  '/trade/inbox',
  '/scout',
  '/scout/picks',
  '/scout/results',
  '/draft',
  '/draft/my-board',
  '/draft/results',
  ...shareTeams.flatMap((team) => {
    const rawTeamId = String(team.id ?? '').trim().toLowerCase()
    const teamId = rawTeamId ? encodeURIComponent(rawTeamId) : ''
    return teamId ? [`/predictions/team/${teamId}`, `/statistics/team/${teamId}`] : []
  }),
]

function getShareMetadataForUrl(requestUrl) {
  const url = new URL(requestUrl, 'http://gridshift.local')
  return getPageShareMetadata({
    route: parseAppRoute(url.pathname, url.search),
    season: shareSeason,
    teams: shareTeams,
  })
}

function pageShareMetadataPlugin() {
  let projectRoot = process.cwd()

  return {
    name: 'gridshift-page-share-metadata',
    configResolved(config) {
      projectRoot = config.root
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const requestUrl = context?.originalUrl ?? context?.path ?? '/'
        return renderPageShareMetadataHtml(html, getShareMetadataForUrl(requestUrl))
      },
    },
    closeBundle() {
      const distDirectory = resolvePath(projectRoot, 'dist')
      const indexPath = resolvePath(distDirectory, 'index.html')
      if (!existsSync(indexPath)) return

      const baseHtml = readFileSync(indexPath, 'utf8')
      STATIC_SHARE_ROUTES.forEach((routePath) => {
        const routeHtml = renderPageShareMetadataHtml(baseHtml, getShareMetadataForUrl(routePath))
        const routeDirectory = resolvePath(distDirectory, routePath.slice(1))
        mkdirSync(routeDirectory, { recursive: true })
        writeFileSync(resolvePath(routeDirectory, 'index.html'), routeHtml)
      })
    },
  }
}

function devServiceWorkerReset() {
  return {
    name: 'gridshift-dev-service-worker-reset',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/sw.js') {
          next()
          return
        }

        response.statusCode = 200
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store, must-revalidate')
        response.end(`
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister()
    await Promise.all((await caches.keys()).map((cacheName) => caches.delete(cacheName)))
    for (const client of await self.clients.matchAll({ type: 'window' })) {
      client.navigate(client.url)
    }
  })())
})
`)
      })
    },
  }
}

export default defineConfig(({ command }) => ({
  server: {
    proxy: {
      '/ktc-proxy': {
        target: 'https://keeptradecut.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ktc-proxy/, ''),
      },
      '/api/espn': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/live': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/statistics/scores': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/fantasy': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/draft-sync': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/predictions-sync': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/trade-proposals': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/trade/share': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: command === 'build'
      // The Fantasy Live sandbox is a dev harness. Aliasing its entry to an
      // inert stub keeps the fixture league, replay engine, and dev panel out
      // of production bundles entirely, rather than relying on tree-shaking to
      // prove the disabled branch dead across module boundaries.
      ? [{ find: /^(.*)\/dev\/liveSandbox$/, replacement: '$1/dev/liveSandbox/production-stub.js' }]
      : [],
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    devServiceWorkerReset(),
    pageShareMetadataPlugin(),
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'icons/pwa-64x64.png',
        'icons/pwa-192x192.png',
        'icons/pwa-512x512.png',
        'icons/apple-touch-icon-180x180.png',
        'icons/favicon.ico',
        'logos/*.png',
        'nfl-data-2026.json',
      ],
      manifest: {
        name: 'GridShift',
        short_name: 'GridShift',
        description: 'GridShift — predict the 2026 NFL season, manage fantasy leagues, and follow the draft live.',
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
        // API URLs must reach nginx/the server sidecar instead of being
        // mistaken for client-side navigations by the installed PWA.
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
          globIgnores: ['**/*.map', 'icons/icon.png'],
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
}))
