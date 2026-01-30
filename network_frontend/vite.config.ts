import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Keep isolated from the Pictionary app (5173).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },
})
