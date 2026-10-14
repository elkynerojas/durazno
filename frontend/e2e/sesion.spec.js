import { expect, test } from '@playwright/test'

const CORREO = process.env.E2E_CORREO ?? 'e2e-agronomo@example.com'
const CLAVE = process.env.E2E_CLAVE

async function ingresar(page, correo, clave) {
  await page.goto('/')
  await page.getByLabel('Correo').fill(correo)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Ingresar' }).click()
}

test('credenciales inválidas muestran un mensaje genérico', async ({ page }) => {
  // Correo distinto en cada corrida para no acumular intentos fallidos en el límite.
  await ingresar(page, `no-existe-${Date.now()}@example.com`, 'clave-equivocada')
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos')
  await expect(page).toHaveURL('/')
})

test('inicio de sesión correcto lleva al mapa del predio', async ({ page }) => {
  test.skip(!CLAVE, 'Defina E2E_CLAVE y ejecute app.scripts.sembrar_e2e')
  await ingresar(page, CORREO, CLAVE)
  await expect(page).toHaveURL('/mapa')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await page.getByRole('button', { name: 'Salir' }).click()
  await expect(page).toHaveURL('/')
})

test('el mapa sin sesión redirige al inicio', async ({ page }) => {
  await page.goto('/mapa')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()
})
