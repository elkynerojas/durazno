import { defineConfig, devices } from '@playwright/test'

// Se ejecuta en el contenedor `e2e` contra el frontend de desarrollo:
//   docker compose --profile e2e run --rm e2e
// En Docker el contenedor e2e comparte la red del frontend: localhost es un contexto seguro,
// necesario para la geolocalización (HU-12).
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'on-first-retry',
    // Para probar el stack de producción en un equipo, con su certificado autofirmado.
    ignoreHTTPSErrors: process.env.E2E_IGNORAR_HTTPS === '1',
  },
  // El aplicativo se usa sobre todo desde un teléfono Android en campo.
  projects: [{ name: 'android', use: { ...devices['Pixel 7'] } }],
})
