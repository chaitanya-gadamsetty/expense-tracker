import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served from https://chaitanya-gadamsetty.github.io/expense-tracker/
const base = '/expense-tracker/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Expense Tracker',
        short_name: 'Expenses',
        description: 'Household expenses: paste an SMS or say it, see where the money goes.',
        theme_color: '#4338ca',
        background_color: '#f6f5f1',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'] },
    }),
  ],
  // Pre-bundle up front so the dev server never reloads mid-session with a second copy of Dexie
  // (which would stop live queries from refreshing). Production builds are unaffected.
  optimizeDeps: { include: ['dexie', 'dexie-react-hooks', 'fflate'] },
  server: { host: true },
})
