import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Base path. Local dev/preview serve from "/"; the GitHub Pages build sets
// BASE_PATH=/lemon/ (project sites live under /<repo>/) so every asset, the
// service worker and the manifest resolve correctly under the subpath.
const base = process.env.BASE_PATH || '/'

// Basket Score is a personal-use mobile web app. We ship it as an installable
// PWA so it can live on the home screen and grab camera access for scanning.
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Basket Score',
        short_name: 'Basket',
        description: 'Scan, price and score your grocery basket on fitness-value.',
        theme_color: '#0f1115',
        background_color: '#0f1115',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            // Cache Open Food Facts product lookups so re-scanning is instant
            // and the basket survives flaky shop wifi.
            urlPattern: /^https:\/\/world\.openfoodfacts\.org\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'off-api',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
})
