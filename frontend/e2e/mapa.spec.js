import { expect, test } from '@playwright/test'

import {
  CLAVE,
  asegurarPredio,
  dibujarLote,
  ingresar,
  limpiarDatosE2E,
  puntoDelMapa,
} from './ayudas'

// Las pruebas comparten el mapa y la base: corren una tras otra.
test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  test.skip(!CLAVE, 'Defina E2E_CLAVE y ejecute app.scripts.sembrar_e2e')
  await ingresar(page)
  await expect(page).toHaveURL('/mapa')
  await asegurarPredio(page)
  await page.goto('/lotes')
  await limpiarDatosE2E(page)
  await expect(page.locator('.leaflet-container')).toBeVisible()
})

test.afterEach(async ({ page }) => {
  await limpiarDatosE2E(page)
})

test('el agrónomo dibuja un lote, ve su área y lo elimina', async ({ page }) => {
  const codigo = `E2E-${Date.now() % 1_000_000}`
  const formulario = await dibujarLote(page, codigo)
  await expect(formulario.getByLabel('Área calculada')).toHaveValue(/^[\d.,]+ ha$/)
  await expect(page.getByRole('row', { name: new RegExp(codigo) })).toBeVisible()

  await formulario.getByRole('button', { name: 'Eliminar lote' }).click()
  await formulario.getByRole('button', { name: `Confirmar: eliminar ${codigo}` }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nuevo lote')
  await expect(page.getByRole('row', { name: new RegExp(codigo) })).toHaveCount(0)
})

test('el agrónomo ubica una trampa en su lote y descarga el QR', async ({ page }) => {
  const sufijo = Date.now() % 1_000_000
  const codigoLote = `E2E-T${sufijo}`
  await dibujarLote(page, codigoLote)

  await page.goto('/trampas')
  await page.getByLabel('Lote', { exact: true }).selectOption({ label: codigoLote })
  // El mapa encuadra el lote: su centro queda en el centro del mapa.
  await page.waitForTimeout(400)
  await page.mouse.click(...(await puntoDelMapa(page, 0.5, 0.5)))
  await expect(page.getByLabel('Latitud')).not.toHaveValue('')
  await expect(page.getByText(`El punto está dentro del polígono de ${codigoLote}.`)).toBeVisible()

  const codigo = `ICA-E2E-${sufijo}`
  await page.getByLabel('Código ICA (oficial)').fill(codigo)
  await page.getByRole('radio', { name: /McPhail/ }).check()
  await page.getByRole('button', { name: 'Guardar y generar QR' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Trampa ${codigo}`)
  await expect(page.getByLabel('Estado')).toHaveValue('activa')
  await expect(page.getByRole('img', { name: `QR de la trampa ${codigo}` })).toBeVisible()
  const fila = page.getByRole('row', { name: new RegExp(codigo) })
  await expect(fila).toContainText('McPhail + proteína hidrolizada')
  const codigoQr = (await page.locator('.qr-codigo').textContent()).trim()
  expect(codigoQr).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/)

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar PNG' }).click(),
  ])
  expect(descarga.suggestedFilename()).toBe(`qr-${codigoQr}.png`)

  // HU-16: escanear el QR sin sesión lleva a la ficha después de iniciar sesión.
  await page.evaluate(() => localStorage.clear())
  await page.goto(`/t/${codigoQr}`)
  await expect(page).toHaveURL('/')
  await ingresar(page)
  await expect(page).toHaveURL(`/t/${codigoQr}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(codigo)
  await expect(page.getByText(`${codigoLote}`, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Registrar lectura' })).toBeDisabled()

  await page.goto('/t/ZZZZ2345')
  await expect(page.getByRole('alert')).toContainText('No hay ninguna trampa con el código QR')
})
