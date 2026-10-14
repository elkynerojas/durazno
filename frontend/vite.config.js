import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En Docker la API se alcanza por el nombre del servicio (http://api:8000).
// Fuera de Docker, por localhost.
const apiProxy = process.env.VITE_API_PROXY ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Con volúmenes montados desde Windows/macOS los eventos de archivo no
    // siempre llegan al contenedor; el sondeo garantiza la recarga en caliente.
    watch: { usePolling: process.env.VITE_USE_POLLING === 'true' },
    proxy: {
      '/api': { target: apiProxy, changeOrigin: true },
    },
  },
})
