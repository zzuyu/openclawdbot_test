import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Codespaces public URL includes the port in the subdomain: ...-18789.app.github.dev
// We bind dev server on 0.0.0.0:18789 and keep strictPort to surface conflicts early.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 18789,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
    },
  },
})
