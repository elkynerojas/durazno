import { expect } from '@playwright/test'

export const CORREO = process.env.E2E_CORREO ?? 'e2e-agronomo@example.com'
export const CLAVE = process.env.E2E_CLAVE

export async function ingresar(page, correo = CORREO, clave = CLAVE) {
  await page.goto('/')
  await page.getByLabel('Correo').fill(correo)
  await page.getByLabel('Contraseña').fill(clave)
  await page.getByRole('button', { name: 'Ingresar' }).click()
}

// Las pruebas trabajan en su propio predio («Predio E2E»), que crean si no existe, y lo dejan
// como predio actual del navegador, sin límite.
export async function asegurarPredio(page) {
  const predioId = await page.evaluate(async () => {
    const renovar = await fetch('/api/v1/auth/renovar', { method: 'POST' })
    const cabeceras = {
      Authorization: `Bearer ${(await renovar.json()).access_token}`,
      'Content-Type': 'application/json',
    }
    const predios = await (await fetch('/api/v1/predios', { headers: cabeceras })).json()
    const datos = { nombre: 'Predio E2E', vereda: 'Icota', municipio: 'Cácota', area_ha: 30 }
    let predio = predios.find((p) => p.nombre === datos.nombre)
    if (!predio) {
      const creado = await fetch('/api/v1/predios', {
        method: 'POST',
        headers: cabeceras,
        body: JSON.stringify(datos),
      })
      predio = await creado.json()
    } else if (predio.limite) {
      // Una corrida que falló pudo dejarle límite: se quita para empezar igual siempre.
      await fetch(`/api/v1/predios/${predio.id}`, {
        method: 'PUT',
        headers: cabeceras,
        body: JSON.stringify(datos),
      })
    }
    localStorage.setItem('icota.predio', predio.id)
    return predio.id
  })
  await page.reload()
  return predioId
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
    // El token de acceso vive en memoria: se pide uno con la cookie de renovación.
    const renovar = await fetch('/api/v1/auth/renovar', { method: 'POST' })
    const cabeceras = { Authorization: `Bearer ${(await renovar.json()).access_token}` }
    const leer = async (ruta) => (await fetch(`/api/v1${ruta}`, { headers: cabeceras })).json()
    const borrar = (ruta) => fetch(`/api/v1${ruta}`, { method: 'DELETE', headers: cabeceras })
    for (const predio of await leer('/predios')) {
      for (const trampa of await leer(`/trampas?predio_id=${predio.id}`)) {
        if (trampa.codigo_ica.startsWith('ICA-E2E-')) await borrar(`/trampas/${trampa.id}`)
      }
      for (const lote of await leer(`/lotes?predio_id=${predio.id}`)) {
        if (lote.codigo.startsWith('E2E-')) await borrar(`/lotes/${lote.id}`)
      }
    }
  })
  await page.reload()
}

// Crea por la API trampas activas dentro del lote, en los puntos dados como fracciones de su
// rectángulo ([fx, fy], 0..1). Devuelve los códigos ICA en el mismo orden.
export async function crearTrampasE2E(page, codigoLote, fracciones) {
  return page.evaluate(
    async ({ codigoLote, fracciones, sufijo }) => {
      const renovar = await fetch('/api/v1/auth/renovar', { method: 'POST' })
      const cabeceras = {
        Authorization: `Bearer ${(await renovar.json()).access_token}`,
        'Content-Type': 'application/json',
      }
      const predioId = localStorage.getItem('icota.predio')
      const lotes = await (
        await fetch(`/api/v1/lotes?predio_id=${predioId}`, { headers: cabeceras })
      ).json()
      const lote = lotes.find((l) => l.codigo === codigoLote)
      const [esquina, , opuesta] = lote.geom.coordinates[0]
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(
        new Date(),
      )
      const codigos = []
      for (const [i, [fx, fy]] of fracciones.entries()) {
        const codigo = `ICA-E2E-${sufijo}-${i + 1}`
        await fetch('/api/v1/trampas', {
          method: 'POST',
          headers: cabeceras,
          body: JSON.stringify({
            lote_id: lote.id,
            codigo_ica: codigo,
            tipo: 'jackson',
            atrayente: 'Trimedlure',
            fecha_instalacion: hoy,
            geom: {
              type: 'Point',
              coordinates: [
                esquina[0] + (opuesta[0] - esquina[0]) * fx,
                esquina[1] + (opuesta[1] - esquina[1]) * fy,
              ],
            },
          }),
        })
        codigos.push(codigo)
      }
      return codigos
    },
    { codigoLote, fracciones, sufijo: Date.now() % 1_000_000 },
  )
}
