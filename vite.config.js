import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Static build (dist/) -> Cloudflare Pages.
export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run dev:lan` exposes the dev server to phones on the same Wi-Fi.
    // Never let it serve local secrets.
    fs: {
      deny: ['.env', '.env.*', '**/.secrets/**', '**/.git/**', '*.{crt,pem,key}'],
    },
  },
  build: { outDir: 'dist' },
})
