import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND_URL = process.env.VITE_API_URL ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/agent': BACKEND_URL,
      '/agents': BACKEND_URL,
      '/onboard': BACKEND_URL,
      '/health': BACKEND_URL,
      '/ledger': BACKEND_URL,
    },
  },
})
