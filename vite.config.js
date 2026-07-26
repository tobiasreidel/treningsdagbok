import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a new build waits instead of swapping in silently, so we can
      // show a "reload to update" banner (see components/UpdatePrompt.jsx).
      registerType: 'prompt',
      // Registration is handled by the useRegisterSW() hook in UpdatePrompt,
      // so don't also inject the auto-register script (avoids double register).
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Treningsdagbok',
        short_name: 'Trening',
        description: 'Personal training diary',
        theme_color: '#4f46e5',
        background_color: '#0b1020',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell precaching. Supabase API calls are intentionally NOT
        // cached here — freshness matters and the offline outbox handles writes.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: {
        // Let the service worker run in `vite dev` so PWA behaviour is testable.
        enabled: false,
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Dependencies change on an npm update; app code changes on every
        // push. Keeping them apart means a deploy re-downloads a few kB of
        // app chunks over mobile data instead of React and Supabase again -
        // which matters here because the service worker precaches the lot.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
