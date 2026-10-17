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
  await limpiarDatosE2E(page)
  await expect(page.locator('.leaflet-container')).toBeVisible()
})

test.afterEach(async ({ page }) => {
  await limpiarDatosE2E(page)
})

test('el agrónomo dibuja un lote, ve su área y lo elimina', async ({ page }) => {
  const codigo = `E2E-${Date.now() % 1_000_000}`
  const panel = await dibujarLote(page, codigo, [0.15, 0.1, 0.45, 0.35])
  await expect(panel.getByText(/^Área: [\d.,]+ ha$/)).toBeVisible()
  await expect(page.locator('.etiqueta-lote', { hasText: codigo })).toBeVisible()

  await panel.getByRole('button', { name: 'Eliminar lote' }).click()
  await panel.getByRole('button', { name: `Confirmar: eliminar ${codigo}` }).click()
  await expect(page.locator('.etiqueta-lote', { hasText: codigo })).toHaveCount(0)
})

test('el agrónomo ubica una trampa tocando el mapa dentro de un lote', async ({ page }) => {
  const sufijo = Date.now() % 1_000_000
  const lote = await dibujarLote(page, `E2E-T${sufijo}`, [0.55, 0.1, 0.85, 0.4])
  await expect(lote.getByText(/^Área:/)).toBeVisible()
  await lote.getByRole('button', { name: 'Cancelar' }).click()

  await page.getByRole('button', { name: 'Nueva trampa' }).click()
  const panel = page.getByRole('complementary', { name: 'Nueva trampa' })
  await page.mouse.click(...(await puntoDelMapa(page, 0.7, 0.25)))
  await expect(panel.getByLabel('Latitud')).not.toHaveValue('')
  await expect(panel.getByLabel('Lote')).toHaveValue(/.+/)

  const codigo = `ICA-E2E-${sufijo}`
  await panel.getByLabel('Código ICA').fill(codigo)
  await panel.getByRole('button', { name: 'Guardar' }).click()

  const guardada = page.getByRole('complementary', { name: `Trampa ${codigo}` })
  await expect(guardada.getByLabel('Estado')).toHaveValue('activa')
  await expect(page.locator('.marcador-trampa--activa')).not.toHaveCount(0)

  // HU-14: la trampa recibe su QR, que se ve en el panel y se descarga.
  await expect(guardada.getByRole('img', { name: `QR de la trampa ${codigo}` })).toBeVisible()
  const codigoQr = await guardada.locator('.qr-trampa__codigo').textContent()
  expect(codigoQr).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/)
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    guardada.getByRole('button', { name: 'Descargar PNG' }).click(),
  ])
  expect(descarga.suggestedFilename()).toBe(`qr-${codigoQr}.png`)
})
