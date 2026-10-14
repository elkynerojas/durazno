import { expect, test } from '@playwright/test'

const USUARIO = process.env.E2E_USUARIO ?? 'e2e-agronomo'
const CLAVE = process.env.E2E_CLAVE

async function ingresar(page, usuario, clave) {
  await page.goto('/')
  await page.getByLabel('Usuario').fill(usuario)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Ingresar' }).click()
}

test('credenciales inválidas muestran un mensaje genérico', async ({ page }) => {
  await ingresar(page, 'no-existe', 'clave-equivocada')
  await expect(page.getByRole('alert')).toHaveText('Usuario o contraseña incorrectos')
  await expect(page).toHaveURL('/')
})

test('inicio de sesión correcto lleva al mapa del predio', async ({ page }) => {
  test.skip(!CLAVE, 'Defina E2E_CLAVE y ejecute app.scripts.sembrar_e2e')
  await ingresar(page, USUARIO, CLAVE)
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
