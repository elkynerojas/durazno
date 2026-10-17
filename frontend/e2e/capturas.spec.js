import { expect, test } from '@playwright/test'

import { CLAVE, asegurarPredio, ingresar, limpiarDatosE2E } from './ayudas'

// Capturas de las vistas para compararlas con los mockups (no verifica comportamiento).
// Se ejecuta a pedido: CAPTURAS=1 docker compose --profile e2e run --rm e2e npx playwright test capturas
test.skip(!process.env.CAPTURAS || !CLAVE, 'Defina CAPTURAS=1 y E2E_CLAVE')
test.describe.configure({ mode: 'serial' })

for (const [nombre, ancho, alto] of [
  ['escritorio', 1440, 1000],
  ['telefono', 412, 915],
]) {
  test(`capturas ${nombre}`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: ancho, height: alto })
    await page.goto('/')
    await page.screenshot({ path: `test-results/capturas/${nombre}-00-inicio.png`, fullPage: true })
    await ingresar(page)
    await expect(page).toHaveURL('/mapa')
    await asegurarPredio(page)
    await limpiarDatosE2E(page)
    await sembrarMuestra(page)
    for (const [ruta, archivo] of [
      ['/mapa', '01-mapa'],
      ['/lotes', '02-lotes'],
      ['/trampas', '03-trampas'],
      ['/predio', '04-predio'],
      ['/usuarios', '05-usuarios'],
    ]) {
      await page.goto(ruta)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(600)
      await page.screenshot({
        path: `test-results/capturas/${nombre}-${archivo}.png`,
        fullPage: true,
      })
    }
    await page.goto('/trampas')
    await page.getByRole('button', { name: 'Ver ficha de ICA-E2E-0031' }).click()
    await expect(page.getByRole('img', { name: /QR de la trampa/ })).toBeVisible()
    // Deja terminar la animación del encuadre del lote.
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `test-results/capturas/${nombre}-06-trampa.png`, fullPage: true })
    await limpiarDatosE2E(page)
  })
}

// Dos lotes con tres trampas cerca del centro de Cácota, creados con la API.
async function sembrarMuestra(page) {
  await page.evaluate(async () => {
    const cabeceras = {
      Authorization: `Bearer ${(await (await fetch('/api/v1/auth/renovar', { method: 'POST' })).json()).access_token}`,
      'Content-Type': 'application/json',
    }
    const crear = async (ruta, cuerpo) =>
      (
        await fetch(`/api/v1${ruta}`, {
          method: 'POST',
          headers: cabeceras,
          body: JSON.stringify(cuerpo),
        })
      ).json()
    const cuadro = (x0, y0, x1, y1) => ({
      type: 'Polygon',
      coordinates: [
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ],
      ],
    })
    const a = await crear('/lotes', {
      codigo: 'E2E-01',
      nombre: 'Lote del río',
      geom: cuadro(-72.644, 7.265, -72.6415, 7.2675),
    })
    const b = await crear('/lotes', {
      codigo: 'E2E-02',
      geom: cuadro(-72.6415, 7.265, -72.639, 7.2675),
    })
    const trampa = (lote, codigo, tipo, lng, lat) =>
      crear('/trampas', {
        lote_id: lote.id,
        codigo_ica: codigo,
        tipo,
        atrayente: tipo === 'jackson' ? 'Trimedlure' : 'Proteína hidrolizada',
        fecha_instalacion: '2026-09-03',
        geom: { type: 'Point', coordinates: [lng, lat] },
      })
    await trampa(a, 'ICA-E2E-0030', 'jackson', -72.6432, 7.2662)
    await trampa(a, 'ICA-E2E-0031', 'mcphail', -72.6424, 7.2668)
    await trampa(b, 'ICA-E2E-0032', 'jackson', -72.6402, 7.2663)
  })
}
