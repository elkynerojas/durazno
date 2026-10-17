import { expect } from '@playwright/test'

export const CORREO = process.env.E2E_CORREO ?? 'e2e-agronomo@example.com'
export const CLAVE = process.env.E2E_CLAVE

export async function ingresar(page, correo = CORREO, clave = CLAVE) {
  await page.goto('/')
  await page.getByLabel('Correo').fill(correo)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Ingresar' }).click()
}

// Los lotes exigen el predio registrado: lo registra si la base está vacía.
export async function asegurarPredio(page) {
  await page.getByRole('link', { name: 'Predio' }).click()
  const titulo = page.getByRole('heading', { level: 2 })
  await expect(titulo).toBeVisible()
  if ((await titulo.textContent()) === 'Registrar el predio') {
    await page.getByLabel('Nombre').fill('Finca E2E')
    await page.getByLabel('Área (hectáreas)').fill('30')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Datos del predio guardados.')).toBeVisible()
  }
  await page.getByRole('link', { name: 'Mapa' }).click()
}

// Punto del mapa en fracciones de su ancho y alto.
export async function puntoDelMapa(page, fx, fy) {
  const caja = await page.locator('.leaflet-container').boundingBox()
  return [caja.x + caja.width * fx, caja.y + caja.height * fy]
}

// Dibuja un rectángulo con Geoman y lo guarda con el código dado.
export async function dibujarLote(page, codigo, [x0, y0, x1, y1] = [0.35, 0.3, 0.65, 0.6]) {
  await page.locator('.leaflet-pm-icon-polygon').click()
  for (const [fx, fy] of [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ]) {
    await page.mouse.click(...(await puntoDelMapa(page, fx, fy)))
  }
  const panel = page.getByRole('complementary', { name: 'Nuevo lote' })
  await panel.getByLabel('Código').fill(codigo)
  await panel.getByRole('button', { name: 'Guardar' }).click()
  return page.getByRole('complementary', { name: `Lote ${codigo}` })
}

// Borra con la API (con la sesión del navegador) las trampas y lotes de corridas anteriores
// de E2E, para que una prueba fallida no deje polígonos que estorben al dibujar.
export async function limpiarDatosE2E(page) {
  await page.evaluate(async () => {
    const cabeceras = { Authorization: `Bearer ${localStorage.getItem('icota.token')}` }
    const leer = async (ruta) => (await fetch(`/api/v1${ruta}`, { headers: cabeceras })).json()
    const borrar = (ruta) => fetch(`/api/v1${ruta}`, { method: 'DELETE', headers: cabeceras })
    for (const trampa of await leer('/trampas')) {
      if (trampa.codigo_ica.startsWith('ICA-E2E-')) await borrar(`/trampas/${trampa.id}`)
    }
    for (const lote of await leer('/lotes')) {
      if (lote.codigo.startsWith('E2E-')) await borrar(`/lotes/${lote.id}`)
    }
  })
  await page.reload()
}
