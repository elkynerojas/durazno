import { expect, test } from '@playwright/test'

import { CLAVE, CORREO, ingresar } from './ayudas'

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

  // HU-08.7: el token de renovación está en una cookie HttpOnly, fuera del alcance de JavaScript,
  // y la sesión sobrevive a una recarga.
  const cookie = (await page.context().cookies()).find((c) => c.name === 'icota_renovacion')
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/v1/auth' })
  expect(await page.evaluate(() => document.cookie)).not.toContain('icota_renovacion')
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([])
  await page.reload()
  await expect(page).toHaveURL('/mapa')
  await expect(page.locator('.leaflet-container')).toBeVisible()

  // En el teléfono el menú lateral está plegado.
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir' }).click()
  await expect(page).toHaveURL('/')
  // Salir borra la cookie: recargar ya no recupera la sesión.
  await page.goto('/mapa')
  await expect(page).toHaveURL('/')
})

test('el mapa sin sesión redirige al inicio', async ({ page }) => {
  await page.goto('/mapa')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()
})
