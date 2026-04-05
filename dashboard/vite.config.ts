import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/agent': 'http://localhost:3000',
      '/agents': 'http://localhost:3000',
      '/onboard': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
})
