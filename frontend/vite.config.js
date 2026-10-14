import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// En Docker la API se alcanza por el nombre del servicio (http://api:8000).
// Fuera de Docker, por localhost.
const apiProxy = process.env.VITE_API_PROXY ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Permite que el contenedor de pruebas E2E entre por el nombre del servicio.
    allowedHosts: ['frontend'],
    // Con volúmenes montados desde Windows/macOS los eventos de archivo no
    // siempre llegan al contenedor; el sondeo garantiza la recarga en caliente.
    watch: { usePolling: process.env.VITE_USE_POLLING === 'true' },
    proxy: {
      '/api': { target: apiProxy, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/test/**', 'src/main.jsx'],
    },
  },
})
