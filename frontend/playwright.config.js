import { defineConfig, devices } from '@playwright/test'

// Se ejecuta en el contenedor `e2e` contra el frontend de desarrollo:
//   docker compose --profile e2e run --rm e2e
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'on-first-retry',
  },
  // El aplicativo se usa sobre todo desde un teléfono Android en campo.
  projects: [{ name: 'android', use: { ...devices['Pixel 7'] } }],
})
