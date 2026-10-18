import { expect, test } from '@playwright/test'

import {
  CLAVE,
  CORREO_TECNICO,
  asegurarPredio,
  asegurarTecnicoE2E,
  colorEnElMapa,
  crearTrampasE2E,
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
  await expect.poll(() => colorEnElMapa(page, '#00b4d8')).toBe(true)
  await formulario.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(formulario.getByText('Polígono válido.', { exact: false })).toBeVisible()

  await page.reload()
  await expect(formulario.getByLabel('Código')).toHaveValue(codigo)
  await expect(formulario.getByLabel('Color en el mapa')).toHaveValue('#00b4d8')
  await expect.poll(() => colorEnElMapa(page, '#00b4d8')).toBe(true)
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
  await expect(page.getByRole('link', { name: 'Registrar lectura' })).toBeVisible()

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
  await expect.poll(() => colorEnElMapa(page, '#ff006e')).toBe(true)
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

test('el mapa muestra el estado de monitoreo de las trampas y filtra por lote', async ({
  page,
}) => {
  const codigo = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, codigo)
  const codigoIca = `ICA-E2E-${Date.now() % 1_000_000}`
  // Trampa instalada hace 10 días y sin lecturas: le toca revisión (pendiente).
  await page.evaluate(
    async ({ codigo, codigoIca }) => {
      const renovar = await fetch('/api/v1/auth/renovar', { method: 'POST' })
      const cabeceras = {
        Authorization: `Bearer ${(await renovar.json()).access_token}`,
        'Content-Type': 'application/json',
      }
      const predioId = localStorage.getItem('icota.predio')
      const lotes = await (
        await fetch(`/api/v1/lotes?predio_id=${predioId}`, { headers: cabeceras })
      ).json()
      const lote = lotes.find((l) => l.codigo === codigo)
      const anillo = lote.geom.coordinates[0]
      const centro = [0, 1].map((i) => (anillo[0][i] + anillo[2][i]) / 2)
      // Fecha en la zona del predio, como la calcula el servidor.
      const hace10 = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(
        new Date(Date.now() - 10 * 86_400_000),
      )
      await fetch('/api/v1/trampas', {
        method: 'POST',
        headers: cabeceras,
        body: JSON.stringify({
          lote_id: lote.id,
          codigo_ica: codigoIca,
          tipo: 'mcphail',
          atrayente: 'Proteína hidrolizada',
          fecha_instalacion: hace10,
          geom: { type: 'Point', coordinates: centro },
        }),
      })
    },
    { codigo, codigoIca },
  )

  await page.goto('/mapa')
  const indicador = page.locator('.tarjeta', { hasText: 'Trampas por revisar' })
  await expect(indicador).toContainText('1 pendientes')
  const marcador = page.locator('.marcador-trampa--pendiente')
  await expect(marcador).toHaveCount(1)
  await expect(page.locator('.mapa-tarjeta__leyenda')).toContainText('Vencida')

  await marcador.click()
  const ventana = page.getByLabel(`Trampa ${codigoIca}`)
  await expect(ventana).toContainText('Pendiente')
  await expect(ventana).toContainText('10 días desde la instalación')
  await expect(ventana).toContainText('sin lecturas aún')

  await page.getByLabel('Lote', { exact: true }).selectOption({ label: codigo })
  await expect(page.getByRole('region', { name: 'Lote seleccionado' })).toContainText(codigo)
  await expect(page.locator('.marcador-trampa')).toHaveCount(1)

  // Desde la ventana de la trampa se abre el formulario de lectura (HU-25)…
  await page.locator('.marcador-trampa').click()
  await page
    .getByLabel(`Trampa ${codigoIca}`)
    .getByRole('link', { name: 'Registrar lectura' })
    .click()
  await expect(page).toHaveURL(/\/t\/[A-Z0-9]{8}\/lectura$/)
  await page
    .getByRole('form', { name: 'Lectura de trampa' })
    .getByRole('button', { name: 'Registrar lectura' })
    .click()
  await expect(page.getByRole('status').filter({ hasText: 'registrada' })).toContainText(
    `Lectura de ${codigoIca} registrada.`,
  )
  // …y al volver al mapa la ventana muestra esa última lectura y la trampa al día (HU-18).
  await page.goto('/mapa')
  await page.getByLabel('Lote', { exact: true }).selectOption({ label: codigo })
  await page.locator('.marcador-trampa').click()
  const actualizada = page.getByLabel(`Trampa ${codigoIca}`)
  await expect(actualizada).toContainText('Al día')
  await expect(actualizada).not.toContainText('sin lecturas aún')
})

// --- Rutas de monitoreo (HU-19) ---

const ordenEnLista = async (page) =>
  (
    await page
      .getByRole('list', { name: 'Orden de visita' })
      .locator('.parada__codigo')
      .allTextContents()
  ).map((c) => c.trim())

test('el agrónomo define la ruta de un lote: propuesta, ajuste, mapa y guardado', async ({
  page,
}) => {
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)
  // Sobre una diagonal: 1 en un extremo, 3 en el medio y 2 en el otro extremo.
  const [c1, c2, c3] = await crearTrampasE2E(page, lote, [
    [0.2, 0.2],
    [0.8, 0.8],
    [0.5, 0.5],
  ])

  await page.goto('/rutas')
  await page.getByLabel('Lote', { exact: true }).selectOption({ label: `${lote} · 3 trampas` })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `Ruta de monitoreo · Lote ${lote}`,
  )
  // Sin ruta guardada se propone el recorrido por cercanía: de un extremo al otro.
  await expect(page.getByText(/Propuesta por cercanía/)).toBeVisible()
  const propuesta = await ordenEnLista(page)
  expect([propuesta, [...propuesta].reverse()]).toContainEqual([c1, c3, c2])
  await expect(page.getByText('La ruta incluye las 3 trampas activas del lote')).toBeVisible()
  // Línea del recorrido (color #e8875a, CapaRuta).
  await expect.poll(() => colorEnElMapa(page, '#e8875a')).toBe(true)
  await expect(page.locator('.mapa-tarjeta__leyenda')).toContainText(/Recorrido: ≈ [\d.]+ m/)

  // Ajuste con las flechas y guardado: el servidor calcula la distancia.
  await page.getByRole('button', { name: `Subir ${propuesta[2]}` }).click()
  const ajustada = [propuesta[0], propuesta[2], propuesta[1]]
  expect(await ordenEnLista(page)).toEqual(ajustada)
  await page.getByRole('button', { name: 'Guardar ruta' }).click()
  await expect(page.getByText('Ruta guardada.')).toBeVisible()
  await expect(page.locator('.mapa-tarjeta__leyenda')).toContainText(/Recorrido: [\d.]+ m/)

  // Orden con clics sucesivos en el mapa.
  await page.getByRole('button', { name: 'Ordenar en el mapa' }).click()
  await expect(page.getByText('Faltan 3 de 3 trampas')).toBeVisible()
  for (const codigo of [c2, c3, c1]) {
    await page.locator(`.leaflet-marker-icon[title="Agregar ${codigo}"]`).click()
  }
  expect(await ordenEnLista(page)).toEqual([c2, c3, c1])
  await page.getByRole('button', { name: 'Guardar ruta' }).click()
  await expect(page.getByText('Ruta guardada.')).toBeVisible()

  await page.reload()
  await expect.poll(() => ordenEnLista(page)).toEqual([c2, c3, c1])
})

test('se reordena arrastrando la lista', async ({ page }) => {
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)
  await crearTrampasE2E(page, lote, [
    [0.2, 0.2],
    [0.5, 0.5],
    [0.8, 0.8],
  ])
  await page.goto('/rutas')
  await page.getByLabel('Lote', { exact: true }).selectOption({ label: `${lote} · 3 trampas` })
  await expect(page.getByText(/Propuesta por cercanía/)).toBeVisible()
  const antes = await ordenEnLista(page)

  // Arrastre con el dedo (eventos táctiles reales): tocar la manija, sostener y deslizar.
  const manijas = page.locator('.parada__manija')
  await page.getByRole('list', { name: 'Orden de visita' }).scrollIntoViewIfNeeded()
  const origen = await manijas.nth(0).boundingBox()
  const destino = await manijas.nth(2).boundingBox()
  const x = origen.x + origen.width / 2
  const y0 = origen.y + origen.height / 2
  const y1 = destino.y + destino.height / 2 + 12
  const cdp = await page.context().newCDPSession(page)
  const tocar = (type, y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    })
  await tocar('touchStart', y0)
  await page.waitForTimeout(400)
  for (let paso = 1; paso <= 15; paso++) {
    await tocar('touchMove', y0 + ((y1 - y0) * paso) / 15)
    await page.waitForTimeout(20)
  }
  await tocar('touchEnd')
  await expect.poll(() => ordenEnLista(page)).toEqual([antes[1], antes[2], antes[0]])
})

test('al instalar una trampa, la ruta del lote queda por revisar en el mapa y en la lista', async ({
  page,
}) => {
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)
  await crearTrampasE2E(page, lote, [
    [0.2, 0.2],
    [0.8, 0.8],
  ])
  await page.goto('/rutas')
  await page.getByLabel('Lote', { exact: true }).selectOption({ label: `${lote} · 2 trampas` })
  await expect(page.getByText(/Propuesta por cercanía/)).toBeVisible()
  await page.getByRole('button', { name: 'Guardar ruta' }).click()
  await expect(page.getByText('Ruta guardada.')).toBeVisible()
  const fila = page.getByRole('region', { name: 'Rutas del predio' }).locator('li')
  await expect(fila.filter({ hasText: lote })).toContainText('Al día')

  const [nueva] = await crearTrampasE2E(page, lote, [[0.5, 0.5]])

  await page.goto('/mapa')
  const aviso = page.getByText('La ruta de 1 lote requiere revisión:')
  await expect(aviso).toBeVisible()
  await aviso.getByRole('link', { name: lote }).click()

  await expect(page).toHaveURL(/\/rutas\?lote=/)
  await expect(page.getByRole('alert')).toContainText(`Requiere revisión. Se instaló ${nueva}`)
  await expect(fila.filter({ hasText: lote })).toContainText('Requiere revisión')
  // La trampa nueva se agrega al final: el agrónomo revisa el orden y guarda.
  await expect(page.getByText('La ruta incluye las 3 trampas activas del lote')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar ruta' }).click()
  await expect(page.getByText('Ruta guardada.')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(fila.filter({ hasText: lote })).toContainText('Al día')

  await page.goto('/mapa')
  await expect(page.locator('.mapa-tarjeta__lienzo')).toBeVisible()
  await expect(page.getByText(/requiere(n)? revisión:/)).toHaveCount(0)
})

// --- Planeación (HU-21) ---

test('el agrónomo programa una labor que se repite y la ve en la vista anual', async ({ page }) => {
  await asegurarTecnicoE2E(page)
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)

  await page.goto('/plan')
  const anio = new Date().getFullYear()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Plan de actividades ${anio}`)
  await page.getByRole('button', { name: '+ Programar actividad' }).click()
  const formulario = page.getByRole('form', { name: 'Programar actividad' })
  await formulario.getByRole('radio', { name: 'Labor cultural' }).check()
  await formulario.getByLabel('Labor', { exact: true }).selectOption({ label: 'Poda' })
  await formulario.getByLabel('Lote', { exact: true }).selectOption({ label: lote })
  await formulario.getByLabel('Semana').fill('2')
  await formulario.getByLabel('Responsable').selectOption({ label: 'Técnico E2E · técnico' })
  await formulario.getByRole('checkbox', { name: 'Repetir' }).check()
  await formulario.getByLabel('Cada (semanas)').fill('10')
  await formulario.getByLabel('Hasta la semana').fill('40')
  await formulario.getByRole('button', { name: 'Programar' }).click()
  await expect(page.getByText('Se programaron 4 actividades (semanas 2 a 32).')).toBeVisible()

  await page.getByLabel('Lote', { exact: true }).selectOption({ label: lote })
  const celdas = page.getByRole('button', { name: /^Poda \(Cultivo\), semana \d+/ })
  await expect(celdas).toHaveCount(4)
  await page.getByRole('button', { name: /^Poda \(Cultivo\), semana 22:/ }).click()
  const ficha = page.getByRole('region', { name: 'Actividad seleccionada' })
  await expect(ficha).toContainText('Técnico E2E')

  await ficha.getByRole('button', { name: 'Eliminar actividad' }).click()
  await ficha.getByRole('button', { name: 'Eliminar esta y las siguientes' }).click()
  await expect(page.getByText('Actividad eliminada.')).toBeVisible()
  await expect(celdas).toHaveCount(2)
})

test('el agrónomo reprograma una actividad con motivo y queda en el historial', async ({
  page,
}) => {
  const tecnico = await asegurarTecnicoE2E(page)
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)
  await page.evaluate(
    async ({ lote, tecnicoId }) => {
      const renovar = await fetch('/api/v1/auth/renovar', { method: 'POST' })
      const cabeceras = {
        Authorization: `Bearer ${(await renovar.json()).access_token}`,
        'Content-Type': 'application/json',
      }
      const predioId = localStorage.getItem('icota.predio')
      const lotes = await (
        await fetch(`/api/v1/lotes?predio_id=${predioId}`, { headers: cabeceras })
      ).json()
      const loteId = lotes.find((l) => l.codigo === lote).id
      await fetch('/api/v1/plan', {
        method: 'POST',
        headers: cabeceras,
        body: JSON.stringify({
          lote_id: loteId,
          tipo: 'cambio_atrayente',
          tipo_trampa: 'jackson',
          // El año siguiente: sus semanas aún no vencen, sea cual sea la fecha de la prueba.
          anio: new Date().getFullYear() + 1,
          semana: 10,
          responsable_id: tecnicoId,
        }),
      })
    },
    { lote, tecnicoId: tecnico.id },
  )

  await page.goto('/plan')
  await page.getByRole('button', { name: 'Año siguiente' }).click()
  await page.getByLabel('Lote', { exact: true }).selectOption({ label: lote })
  await page
    .getByRole('button', {
      name: 'Recambio trimedlure (Trampas Jackson), semana 10: programada',
    })
    .click()
  const ficha = page.getByRole('region', { name: 'Actividad seleccionada' })
  await ficha.getByRole('button', { name: 'Reprogramar' }).click()
  const formulario = ficha.getByRole('form', { name: 'Reprogramar actividad' })
  await formulario.getByLabel('Nueva semana').fill('12')
  await formulario.getByLabel('Motivo').fill('Aumento de capturas en el lote')
  await formulario.getByRole('button', { name: 'Reprogramar' }).click()

  await expect(page.getByText(`Recambio trimedlure (${lote}) quedó en la semana 12.`)).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: 'Recambio trimedlure (Trampas Jackson), semana 12: reprogramada',
    }),
  ).toBeVisible()
  await expect(ficha).toContainText('Reprogramada de S10 a S12')
  await expect(ficha).toContainText('«Aumento de capturas en el lote»')
  const cambios = page.getByRole('region', { name: 'Cambios del plan' })
  await expect(cambios).toContainText(`Recambio trimedlure · ${lote}: Reprogramada de S10 a S12`)
})

test('el calendario del plan se ve aunque esté vacío y se programa tocando una semana', async ({
  page,
}) => {
  await asegurarTecnicoE2E(page)
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)
  await crearTrampasE2E(page, lote, [[0.5, 0.5]])
  await page.evaluate(async (lote) => {
    const renovar = await fetch('/api/v1/auth/renovar', { method: 'POST' })
    const cabeceras = {
      Authorization: `Bearer ${(await renovar.json()).access_token}`,
      'Content-Type': 'application/json',
    }
    const api = async (ruta, cuerpo) =>
      (
        await fetch(`/api/v1${ruta}`, {
          method: cuerpo ? 'POST' : 'GET',
          headers: cabeceras,
          body: cuerpo && JSON.stringify(cuerpo),
        })
      ).json()
    const predioId = localStorage.getItem('icota.predio')
    const loteId = (await api(`/lotes?predio_id=${predioId}`)).find((l) => l.codigo === lote).id
    const propuesta = await api(`/rutas/propuesta?lote_id=${loteId}`)
    await api('/rutas', { lote_id: loteId, trampas: propuesta.paradas.map((p) => p.trampa_id) })
  }, lote)

  await page.goto('/plan')
  // El año siguiente: sus semanas aún no vencen, sea cual sea la fecha de la prueba.
  await page.getByRole('button', { name: 'Año siguiente' }).click()
  const rejilla = page.getByRole('region', { name: 'Semanas del año' })
  await expect(rejilla.getByRole('rowheader', { name: new RegExp(`Ruta ${lote}`) })).toBeVisible()
  await rejilla.getByRole('button', { name: `Programar Ruta ${lote}, semana 10` }).click()

  const formulario = page.getByRole('form', { name: 'Programar actividad' })
  await expect(formulario.getByLabel('Semana')).toHaveValue('10')
  await expect(formulario.getByRole('radio', { name: 'Visita de monitoreo' })).toBeChecked()
  await formulario.getByLabel('Responsable').selectOption({ label: 'Técnico E2E · técnico' })
  await formulario.getByRole('button', { name: 'Programar' }).click()
  await expect(page.getByText('Actividad programada en la semana 10.')).toBeVisible()
  await expect(
    rejilla.getByRole('button', {
      name: `Ruta ${lote} (Monitoreo · trampeo), semana 10: programada`,
    }),
  ).toBeVisible()
})

// --- Mi semana (HU-24) ---

test('el técnico ve su semana y abre la ruta en el mapa', async ({ page }) => {
  const tecnico = await asegurarTecnicoE2E(page)
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)
  await crearTrampasE2E(page, lote, [
    [0.3, 0.3],
    [0.7, 0.7],
  ])
  // El administrador define la ruta y programa una visita y una poda para esta semana.
  await page.evaluate(
    async ({ lote, tecnicoId }) => {
      const renovar = await fetch('/api/v1/auth/renovar', { method: 'POST' })
      const cabeceras = {
        Authorization: `Bearer ${(await renovar.json()).access_token}`,
        'Content-Type': 'application/json',
      }
      const api = async (ruta, cuerpo) =>
        (
          await fetch(`/api/v1${ruta}`, {
            method: cuerpo ? 'POST' : 'GET',
            headers: cabeceras,
            body: cuerpo && JSON.stringify(cuerpo),
          })
        ).json()
      const predioId = localStorage.getItem('icota.predio')
      const { id: loteId } = (await api(`/lotes?predio_id=${predioId}`)).find(
        (l) => l.codigo === lote,
      )
      const propuesta = await api(`/rutas/propuesta?lote_id=${loteId}`)
      await api('/rutas', { lote_id: loteId, trampas: propuesta.paradas.map((p) => p.trampa_id) })
      const { anio, semana } = await api('/plan/mias')
      const comun = { lote_id: loteId, anio, semana, responsable_id: tecnicoId }
      await api('/plan', { ...comun, tipo: 'visita_monitoreo' })
      await api('/plan', { ...comun, tipo: 'labor_cultural', labor: 'poda', notas: 'Con tijera' })
    },
    { lote, tecnicoId: tecnico.id },
  )

  // Entra el técnico desde su teléfono.
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir' }).click()
  await ingresar(page, CORREO_TECNICO)
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('link', { name: 'Mi semana' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mi semana')
  const lista = page.getByRole('list', { name: 'Actividades de la semana' })
  const visita = lista.getByRole('listitem').filter({ hasText: `Ruta ${lote}` })
  await expect(visita).toContainText(`Lote ${lote}`)
  await expect(visita).toContainText('ruta de 2 trampas')
  const poda = lista.getByRole('listitem').filter({ hasText: 'Poda' })
  await expect(poda).toContainText('Con tijera')
  await expect(visita).toContainText('0 de 2 trampas leídas')
  // HU-22: la labor la marca cumplida el técnico; las visitas se cumplen con las lecturas.
  await poda.getByRole('button', { name: 'Marcar cumplida' }).click()
  await expect(poda).toContainText('Cumplida')
  await expect(poda.getByRole('button', { name: 'Desmarcar cumplida' })).toBeVisible()

  await visita.getByRole('button', { name: 'Ver la ruta en el mapa' }).click()
  await expect(page).toHaveURL(/\/rutas\?lote=/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `Ruta de monitoreo · Lote ${lote}`,
  )
  await expect(page.getByText('La ruta incluye las 2 trampas activas del lote')).toBeVisible()

  // Vuelve el administrador para que la limpieza pueda borrar los datos de prueba.
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir' }).click()
  await ingresar(page)
  // Vuelve a la página donde estaba (RutaProtegida recuerda la ruta pedida).
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `Ruta de monitoreo · Lote ${lote}`,
  )
})

// --- Lecturas de trampa (HU-25) ---

test('se registra la lectura de una trampa desde su QR, con la ubicación del teléfono', async ({
  page,
}) => {
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)
  const [codigo] = await crearTrampasE2E(page, lote, [[0.5, 0.5]])
  const { codigoQr, lat, lng } = await page.evaluate(async (codigo) => {
    const renovar = await fetch('/api/v1/auth/renovar', { method: 'POST' })
    const cabeceras = { Authorization: `Bearer ${(await renovar.json()).access_token}` }
    const predioId = localStorage.getItem('icota.predio')
    const trampas = await (
      await fetch(`/api/v1/trampas?predio_id=${predioId}`, { headers: cabeceras })
    ).json()
    const trampa = trampas.find((t) => t.codigo_ica === codigo)
    const [lng, lat] = trampa.geom.coordinates
    return { codigoQr: trampa.codigo_qr, lat, lng }
  }, codigo)
  // El técnico está a unos 11 m de la trampa (0,0001° al norte), con ±5 m de precisión.
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: lat + 0.0001, longitude: lng, accuracy: 5 })

  await page.goto(`/t/${codigoQr}`)
  await expect(page.getByText('Aún no hay lecturas registradas para esta trampa.')).toBeVisible()
  await page.getByRole('link', { name: 'Registrar lectura' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lectura de trampa')
  const formulario = page.getByRole('form', { name: 'Lectura de trampa' })
  await expect(formulario.getByLabel('Días de exposición')).toHaveValue('0')
  await expect(formulario.getByText(/a ≈ 1\d m de la trampa/)).toBeVisible()
  for (let i = 0; i < 3; i++) {
    await formulario.getByRole('button', { name: 'Sumar Ceratitis capitata machos' }).click()
  }
  await formulario.getByLabel('Observaciones').fill('Prueba E2E')
  await formulario.getByRole('button', { name: 'Registrar lectura' }).click()

  const confirmacion = page.getByRole('status').filter({ hasText: 'registrada' })
  await expect(confirmacion).toContainText(`Lectura de ${codigo} registrada.`)
  await expect(confirmacion).toContainText('3 (3 ♂ · 0 ♀)')
  await expect(confirmacion).toContainText(/Tomada a 1\d m de la trampa/)

  await confirmacion.getByRole('link', { name: 'Ficha de la trampa' }).click()
  const ultima = page.getByRole('region', { name: 'Última lectura' })
  await expect(ultima).toContainText('3 (3 ♂ · 0 ♀)')
  // Una segunda lectura el mismo día choca con la de la visita.
  await page.getByRole('link', { name: 'Registrar lectura' }).click()
  await page.getByRole('button', { name: 'Registrar lectura' }).click()
  await expect(page.getByRole('alert')).toContainText(`Ya hay una lectura de ${codigo} del`)
})

// --- Validación de lecturas (HU-26) ---

test('el agrónomo rechaza con motivo una lectura tomada lejos de la trampa', async ({ page }) => {
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)
  const [codigo] = await crearTrampasE2E(page, lote, [[0.5, 0.5]])
  // Lectura registrada a ≈ 111 m de la trampa (0,001° al norte).
  await page.evaluate(async (codigo) => {
    const renovar = await fetch('/api/v1/auth/renovar', { method: 'POST' })
    const cabeceras = {
      Authorization: `Bearer ${(await renovar.json()).access_token}`,
      'Content-Type': 'application/json',
    }
    const predioId = localStorage.getItem('icota.predio')
    const trampas = await (
      await fetch(`/api/v1/trampas?predio_id=${predioId}`, { headers: cabeceras })
    ).json()
    const trampa = trampas.find((t) => t.codigo_ica === codigo)
    const [lng, lat] = trampa.geom.coordinates
    await fetch('/api/v1/visitas/lecturas', {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({
        trampa_id: trampa.id,
        observado_en: new Date().toISOString(),
        capitata_machos: 2,
        capitata_hembras: 0,
        anastrepha: 0,
        estado_trampa: 'buena',
        cambio_atrayente: false,
        posicion: { type: 'Point', coordinates: [lng, lat + 0.001] },
        precision_m: 6,
      }),
    })
  }, codigo)

  await page.goto('/lecturas')
  const tarjeta = page.getByRole('listitem', { name: `Lectura de ${codigo}` })
  await expect(tarjeta).toContainText(/Tomada a 1\d\d m de la trampa/)
  await tarjeta.getByRole('button', { name: 'Rechazar…' }).click()
  await tarjeta.getByLabel('Motivo del rechazo').fill('Tomada lejos de la trampa')
  await tarjeta.getByRole('button', { name: 'Rechazar' }).click()
  await expect(page.getByText(`Lectura de ${codigo} rechazada.`)).toBeVisible()

  await page.getByRole('button', { name: 'Rechazadas' }).click()
  await expect(page.getByRole('listitem', { name: `Lectura de ${codigo}` })).toContainText(
    'Rechazada por Usuario E2E',
  )
})

test('desde una lectura con capturas se programa una visita adicional', async ({ page }) => {
  await asegurarTecnicoE2E(page)
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)
  const [codigo] = await crearTrampasE2E(page, lote, [[0.5, 0.5]])
  // Ruta del lote y una lectura con 4 capturas registrada hoy.
  await page.evaluate(
    async ({ lote, codigo }) => {
      const renovar = await fetch('/api/v1/auth/renovar', { method: 'POST' })
      const cabeceras = {
        Authorization: `Bearer ${(await renovar.json()).access_token}`,
        'Content-Type': 'application/json',
      }
      const api = async (ruta, cuerpo) =>
        (
          await fetch(`/api/v1${ruta}`, {
            method: cuerpo ? 'POST' : 'GET',
            headers: cabeceras,
            body: cuerpo && JSON.stringify(cuerpo),
          })
        ).json()
      const predioId = localStorage.getItem('icota.predio')
      const loteId = (await api(`/lotes?predio_id=${predioId}`)).find((l) => l.codigo === lote).id
      const trampa = (await api(`/trampas?predio_id=${predioId}`)).find(
        (t) => t.codigo_ica === codigo,
      )
      await api('/rutas', { lote_id: loteId, trampas: [trampa.id] })
      await api('/visitas/lecturas', {
        trampa_id: trampa.id,
        observado_en: new Date().toISOString(),
        capitata_machos: 4,
        capitata_hembras: 0,
        anastrepha: 0,
        estado_trampa: 'buena',
        cambio_atrayente: false,
      })
    },
    { lote, codigo },
  )

  await page.goto('/lecturas')
  const tarjeta = page.getByRole('listitem', { name: `Lectura de ${codigo}` })
  await tarjeta.getByRole('button', { name: 'Programar visita adicional' }).click()
  // La lectura la registró el administrador: se elige al técnico como responsable.
  await tarjeta.getByLabel('Responsable').selectOption({ label: 'Técnico E2E' })
  await tarjeta.getByRole('button', { name: 'Programar' }).click()
  await expect(tarjeta.getByRole('status')).toContainText(
    'Visita adicional programada en la semana',
  )
  await tarjeta.getByRole('link', { name: 'Ver en el plan' }).click()
  await page.getByLabel('Lote', { exact: true }).selectOption({ label: lote })
  await page
    .getByRole('button', { name: new RegExp(`^Ruta ${lote} \\(Monitoreo · trampeo\\)`) })
    .click()
  await expect(page.getByRole('region', { name: 'Actividad seleccionada' })).toContainText(
    `Visita adicional por 4 capturas en ${codigo}`,
  )
})

// --- MTD (HU-28) ---

test('el MTD del predio muestra M, T y D de la semana con la lectura', async ({ page }) => {
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)
  const [codigo] = await crearTrampasE2E(page, lote, [[0.5, 0.5]])
  await page.evaluate(async (codigo) => {
    const renovar = await fetch('/api/v1/auth/renovar', { method: 'POST' })
    const cabeceras = {
      Authorization: `Bearer ${(await renovar.json()).access_token}`,
      'Content-Type': 'application/json',
    }
    const predioId = localStorage.getItem('icota.predio')
    const trampas = await (
      await fetch(`/api/v1/trampas?predio_id=${predioId}`, { headers: cabeceras })
    ).json()
    const trampa = trampas.find((t) => t.codigo_ica === codigo)
    await fetch('/api/v1/visitas/lecturas', {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({
        trampa_id: trampa.id,
        observado_en: new Date().toISOString(),
        capitata_machos: 2,
        capitata_hembras: 1,
        anastrepha: 0,
        dias_exposicion: 7,
        justificacion_dias: 'Prueba E2E del MTD',
        estado_trampa: 'buena',
        cambio_atrayente: false,
      }),
    })
  }, codigo)

  await page.goto('/mtd')
  const capitata = page.getByRole('region', { name: 'MTD de Ceratitis capitata' })
  // Solo esta trampa del Predio E2E tiene lectura: 3 ÷ (1 × 7) = 0,4286.
  await expect(capitata).toContainText('3 ÷ (1 × 7) = 0,4286')
  await expect(capitata.getByRole('row').nth(1)).toContainText('0,4286')
  await expect(page.getByRole('region', { name: 'MTD de Anastrepha spp.' })).toContainText(
    'sin dato (T × D = 0)',
  )

  // Reporte para el ICA (HU-29) del mismo periodo, en CSV y PDF.
  const { readFileSync } = await import('node:fs')
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Reporte ICA (CSV)' }).click(),
  ])
  expect(csv.suggestedFilename()).toMatch(/^mtd-.+\.csv$/)
  const texto = readFileSync(await csv.path(), 'utf-8')
  expect(texto).toContain('M (moscas);T (trampas revisadas);D (días promedio);MTD')
  expect(texto).toContain(';Ceratitis capitata;Jackson + trimedlure;3;1;7,00;0,4286;1')
  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Reporte ICA (PDF)' }).click(),
  ])
  expect(pdf.suggestedFilename()).toMatch(/^mtd-.+\.pdf$/)
  expect(
    readFileSync(await pdf.path())
      .subarray(0, 4)
      .toString(),
  ).toBe('%PDF')
})

// --- Historial de capturas (HU-27) ---

test('el historial de una trampa muestra sus lecturas y se exporta a CSV', async ({ page }) => {
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)
  const [codigo] = await crearTrampasE2E(page, lote, [[0.5, 0.5]])
  const codigoQr = await page.evaluate(async (codigo) => {
    const renovar = await fetch('/api/v1/auth/renovar', { method: 'POST' })
    const cabeceras = {
      Authorization: `Bearer ${(await renovar.json()).access_token}`,
      'Content-Type': 'application/json',
    }
    const predioId = localStorage.getItem('icota.predio')
    const trampas = await (
      await fetch(`/api/v1/trampas?predio_id=${predioId}`, { headers: cabeceras })
    ).json()
    const trampa = trampas.find((t) => t.codigo_ica === codigo)
    await fetch('/api/v1/visitas/lecturas', {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({
        trampa_id: trampa.id,
        observado_en: new Date().toISOString(),
        capitata_machos: 3,
        capitata_hembras: 1,
        anastrepha: 0,
        dias_exposicion: 7,
        justificacion_dias: 'Prueba E2E del historial',
        estado_trampa: 'buena',
        cambio_atrayente: false,
      }),
    })
    return trampa.codigo_qr
  }, codigo)

  await page.goto(`/t/${codigoQr}`)
  await page.getByRole('link', { name: 'Ver historial de capturas' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Historial de capturas')
  const tabla = page.getByRole('table', { name: 'Lecturas' })
  await expect(tabla.getByRole('row')).toHaveCount(2)
  // 4 moscas en 7 días: 4 ÷ (1 × 7) = 0,5714.
  await expect(tabla.getByRole('row').nth(1)).toContainText('0,5714')

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar CSV' }).click(),
  ])
  const ruta = await descarga.path()
  const texto = (await import('node:fs')).readFileSync(ruta, 'utf-8')
  expect(texto).toContain('Fecha y hora;Lote;Trampa (código ICA)')
  expect(texto).toContain(`;${lote};${codigo};Jackson;3;1;0;7;0,5714;registrada`)
})

// --- Registrar una lectura desde el menú, sin escanear el QR ---

test('el técnico registra una lectura desde «Lecturas de trampa» eligiendo la trampa', async ({
  page,
}) => {
  await asegurarTecnicoE2E(page)
  const lote = `E2E-${Date.now() % 1_000_000}`
  await dibujarLote(page, lote)
  const [codigo] = await crearTrampasE2E(page, lote, [[0.5, 0.5]])

  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir' }).click()
  await ingresar(page, CORREO_TECNICO)
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('link', { name: 'Lecturas de trampa' }).click()
  await expect(page.getByRole('heading', { name: 'Mis lecturas' })).toBeVisible()
  await page.getByRole('button', { name: 'Registrar lectura' }).click()
  await page.getByLabel('Código ICA').fill(codigo)
  await page
    .getByRole('list', { name: 'Trampas activas' })
    .getByRole('button', { name: new RegExp(codigo) })
    .click()

  const formulario = page.getByRole('form', { name: 'Lectura de trampa' })
  await formulario.getByRole('button', { name: 'Sumar Ceratitis capitata machos' }).click()
  await formulario.getByRole('button', { name: 'Registrar lectura' }).click()
  await expect(page.getByText(`Lectura de ${codigo} registrada.`)).toBeVisible()

  await page.getByRole('link', { name: 'Registrar otra' }).click()
  await expect(page.getByRole('list', { name: 'Trampas activas' })).toBeVisible()
  await expect(page.getByRole('listitem', { name: `Lectura de ${codigo}` })).toContainText(
    'Pendiente',
  )

  // El agrónomo (aquí, el administrador) la ve en su bandeja de pendientes.
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('button', { name: 'Salir' }).click()
  await ingresar(page)
  // Vuelve a la página donde estaba (RutaProtegida recuerda la ruta pedida).
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lecturas de trampa')
  await expect(page.getByRole('listitem', { name: `Lectura de ${codigo}` })).toBeVisible()
})
