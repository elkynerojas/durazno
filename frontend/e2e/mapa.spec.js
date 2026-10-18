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

test('el color elegido del lote se ve en el mapa y se conserva al abrirlo por enlace', async ({
  page,
}) => {
  const codigo = `E2E-${Date.now() % 1_000_000}`
  const formulario = await dibujarLote(page, codigo)
  await formulario.getByLabel('Color en el mapa').fill('#00b4d8')
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#00b4d8"]')).toHaveCount(1)
  await formulario.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(formulario.getByText('Polígono válido.', { exact: false })).toBeVisible()

  await page.reload()
  await expect(formulario.getByLabel('Código')).toHaveValue(codigo)
  await expect(formulario.getByLabel('Color en el mapa')).toHaveValue('#00b4d8')
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#00b4d8"]')).toHaveCount(1)
})

test('el agrónomo ubica una trampa en su lote y descarga el QR', async ({ page }) => {
  const sufijo = Date.now() % 1_000_000
  const codigoLote = `E2E-T${sufijo}`
  await dibujarLote(page, codigoLote)

  await page.goto('/trampas')

  // HU-12: la ubicación del teléfono llena las coordenadas y muestra su precisión.
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: 7.2667, longitude: -72.6417, accuracy: 4 })
  await page.getByRole('button', { name: 'Usar mi ubicación' }).click()
  await expect(page.getByLabel('Latitud')).toHaveValue('7.2667')
  await expect(page.getByText('Ubicación del GPS con precisión de ±4 m.')).toBeVisible()
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

  // HU-15: PDF de etiquetas del lote.
  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Imprimir etiquetas del lote' }).click(),
  ])
  expect(pdf.suggestedFilename()).toBe(`etiquetas-lote-${codigoLote}.pdf`)

  // HU-13: exportar el predio para Google Earth.
  await page.goto('/mapa')
  const [kml] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar KML' }).click(),
  ])
  expect(kml.suggestedFilename()).toBe('predio-Predio-E2E.kml')

  // HU-16: escanear el QR sin sesión lleva a la ficha después de iniciar sesión.
  await page.context().clearCookies()
  await page.goto(`/t/${codigoQr}`)
  await expect(page).toHaveURL('/')
  await ingresar(page)
  await expect(page).toHaveURL(`/t/${codigoQr}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(codigo)
  await expect(page.getByText(`${codigoLote}`, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Registrar lectura' })).toBeDisabled()

  // HU-17: reemplazar la etiqueta desde la ficha invalida el código anterior.
  await page.getByRole('button', { name: 'Reemplazar etiqueta' }).click()
  await page.getByLabel('Motivo (opcional)').fill('Prueba E2E')
  await page.getByRole('button', { name: 'Confirmar reemplazo' }).click()
  await expect(page).not.toHaveURL(`/t/${codigoQr}`)
  await expect(page.getByText(/→/)).toBeVisible()
  await page.goto(`/t/${codigoQr}`)
  await expect(page.getByRole('alert')).toContainText(`La etiqueta ${codigoQr} fue reemplazada`)

  await page.goto('/t/ZZZZ2345')
  await expect(page.getByRole('alert')).toContainText('No hay ninguna trampa con el código QR')
})

test('el administrador crea un predio desde Predios y lo elimina', async ({ page }) => {
  const nombre = `E2E Predio ${Date.now() % 1_000_000}`
  await page.goto('/predios')
  await page.getByRole('button', { name: '+ Nuevo predio' }).click()
  const formulario = page.getByRole('form', { name: 'Datos del predio' })
  await formulario.getByLabel('Nombre').fill(nombre)
  await formulario.getByLabel('Vereda').fill('Icota')
  await formulario.getByLabel('Área (hectáreas)').fill('12')
  await formulario.getByRole('button', { name: 'Crear predio' }).click()

  // Al crearlo queda abierto su personal para asignar cuentas.
  await expect(page.getByRole('heading', { name: `Personal de ${nombre}` })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(nombre) })).toBeVisible()

  await page.getByRole('button', { name: `Eliminar ${nombre}` }).click()
  await page.getByRole('button', { name: `Confirmar: eliminar ${nombre}` }).click()
  await expect(page.getByRole('row', { name: new RegExp(nombre) })).toHaveCount(0)
})

test('se dibuja el límite del predio con su color y el servidor calcula su área', async ({
  page,
}) => {
  await page.goto('/predio')
  const formulario = page.getByRole('form', { name: 'Datos del predio' })
  await expect(formulario.getByLabel('Nombre')).toHaveValue('Predio E2E')

  await page.getByRole('button', { name: 'Dibujar límite' }).click()
  for (const [fx, fy] of [
    [0.2, 0.2],
    [0.8, 0.2],
    [0.8, 0.8],
    [0.2, 0.8],
    [0.2, 0.2],
  ]) {
    await page.mouse.click(...(await puntoDelMapa(page, fx, fy)))
  }
  await expect(formulario.getByLabel('Área (hectáreas)')).toHaveValue(/^≈ [\d.,]+ ha$/)
  await formulario.getByLabel('Color del límite en el mapa').fill('#ff006e')
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#ff006e"]')).toHaveCount(1)
  await formulario.getByRole('button', { name: 'Guardar' }).click()
  await expect(formulario.getByText('Datos del predio guardados.')).toBeVisible()
  // Ya guardada, el área es la calculada por el servidor (sin «≈»).
  await expect(formulario.getByLabel('Área (hectáreas)')).toHaveValue(/^[\d.,]+ ha$/)

  // Deja el predio de pruebas como estaba.
  await page.getByRole('button', { name: 'Quitar límite' }).click()
  await formulario.getByLabel('Área (hectáreas)').fill('30')
  await formulario.getByRole('button', { name: 'Guardar' }).click()
  await expect(formulario.getByText('Datos del predio guardados.')).toBeVisible()
})
