import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      '~backend/client': path.resolve(__dirname, './client'),
      '~backend': path.resolve(__dirname, '../backend'),
    },
  },
  plugins: [tailwindcss(), react()],
  mode: "development",
  build: {
    minify: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/auth': { target: process.env.BACKEND_URL || 'http://localhost:4000', changeOrigin: true },
      '/cards': { target: process.env.BACKEND_URL || 'http://localhost:4000', changeOrigin: true },
      '/ai': { target: process.env.BACKEND_URL || 'http://localhost:4000', changeOrigin: true },
    },
  },
})
