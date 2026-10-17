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
  await page.goto('/predio')
  // Espera a que termine la carga: mientras tanto el título aún no dice si hay predio.
  await expect(page.getByLabel('Nombre')).toBeVisible()
  const titulo = page.getByRole('heading', { level: 1 })
  if ((await titulo.textContent()) === 'Registrar el predio') {
    await page.getByLabel('Nombre').fill('Finca E2E')
    await page.getByLabel('Área (hectáreas)').fill('30')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Datos del predio guardados.')).toBeVisible()
  }
}

// Punto del mapa en fracciones de su ancho y alto.
export async function puntoDelMapa(page, fx, fy) {
  const mapa = page.locator('.leaflet-container')
  await mapa.scrollIntoViewIfNeeded()
  const caja = await mapa.boundingBox()
  return [caja.x + caja.width * fx, caja.y + caja.height * fy]
}

// En /lotes dibuja un rectángulo con «Dibujar polígono» y lo guarda con el código dado.
export async function dibujarLote(page, codigo, [x0, y0, x1, y1] = [0.3, 0.3, 0.7, 0.7]) {
  await page.getByRole('button', { name: 'Dibujar polígono' }).click()
  for (const [fx, fy] of [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ]) {
    await page.mouse.click(...(await puntoDelMapa(page, fx, fy)))
  }
  const formulario = page.getByRole('form', { name: 'Datos del lote' })
  await expect(formulario.getByText(/Polígono cerrado con 4 vértices/)).toBeVisible()
  await formulario.getByLabel('Código').fill(codigo)
  await formulario.getByRole('button', { name: 'Guardar lote' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Lote ${codigo}`)
  return formulario
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
