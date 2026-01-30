import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Note: in this Codespace, port 18789 is already used by OpenClaw (the /chat URL).
// So we run the demo frontend on 5173 to avoid port conflicts.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
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
