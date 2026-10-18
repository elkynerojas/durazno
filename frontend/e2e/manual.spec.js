import { expect, test } from '@playwright/test'

import { CLAVE, CORREO, ingresar } from './ayudas'

// Capturas del manual de usuario (HU-38): recorre los flujos sobre un predio de demostración y
// guarda las imágenes en test-results/manual/. No verifica comportamiento.
// Se ejecuta a pedido: MANUAL=1 docker compose --profile e2e run --rm e2e npx playwright test manual
test.skip(!process.env.MANUAL || !CLAVE, 'Defina MANUAL=1 y E2E_CLAVE')
test.describe.configure({ mode: 'serial' })

const PREDIO = 'Finca La Esperanza (demostración)'
const AGRONOMA = { correo: 'laura.gomez@demo.persica', nombre: 'Laura Gómez', rol: 'agronomo' }
const TECNICO = { correo: 'andres.rojas@demo.persica', nombre: 'Andrés Rojas', rol: 'tecnico' }
const ESCRITORIO = { width: 1440, height: 900 }
const TELEFONO = { width: 412, height: 915 }

const ruta = (archivo) => `test-results/manual/${archivo}.png`

async function captura(page, archivo, opciones = {}) {
  // El mapa puede seguir pidiendo teselas: se espera la red un tiempo acotado.
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(opciones.espera ?? 700)
  if (opciones.completa) {
    // En el teléfono la barra superior es fija: en vez de una captura de página completa (que
    // la repite al unir los trozos), la ventana se hace tan alta como la página.
    const original = page.viewportSize()
    const alto = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.setViewportSize({ width: original.width, height: Math.min(alto, 2600) })
    await page.waitForTimeout(400)
    await page.screenshot({ path: ruta(archivo) })
    await page.setViewportSize(original)
    return
  }
  await page.screenshot({ path: ruta(archivo) })
}

// Ids de los lotes y trampas de la demostración, por código.
async function elementos(page, predioId) {
  return page.evaluate(async (id) => {
    const tk = (await (await fetch('/api/v1/auth/renovar', { method: 'POST' })).json()).access_token
    const h = { headers: { Authorization: `Bearer ${tk}` } }
    const lotes = await (await fetch(`/api/v1/lotes?predio_id=${id}`, h)).json()
    const trampas = await (await fetch(`/api/v1/trampas?predio_id=${id}`, h)).json()
    return {
      lotes: Object.fromEntries(lotes.map((l) => [l.codigo, l.id])),
      trampas: Object.fromEntries(trampas.map((t) => [t.codigo_ica, t])),
    }
  }, predioId)
}

// Descarga un archivo de la API con la sesión del navegador (para mostrar los PDF).
async function descargar(page, rutaApi, archivo) {
  const base64 = await page.evaluate(async (r) => {
    const tk = (await (await fetch('/api/v1/auth/renovar', { method: 'POST' })).json()).access_token
    const datos = await (
      await fetch(r, { headers: { Authorization: `Bearer ${tk}` } })
    ).arrayBuffer()
    let binario = ''
    for (const b of new Uint8Array(datos)) binario += String.fromCharCode(b)
    return btoa(binario)
  }, rutaApi)
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync('test-results/manual', { recursive: true })
  writeFileSync(`test-results/manual/${archivo}`, Buffer.from(base64, 'base64'))
}

// Predio de demostración con lotes, trampas, rutas, plan y cuatro semanas de lecturas. Si ya
// existe se reutiliza tal cual (las lecturas no se pueden borrar desde la API).
async function sembrarDemostracion(page) {
  return page.evaluate(
    async ({ PREDIO, AGRONOMA, TECNICO, clave }) => {
      const token = async (correo) =>
        (
          await (
            await fetch('/api/v1/auth/token', {
              method: 'POST',
              headers: { 'X-Cliente': 'movil' },
              body: new URLSearchParams({ username: correo, password: clave }),
            })
          ).json()
        ).access_token
      const api = (tk) => async (metodo, ruta, cuerpo) => {
        const r = await fetch(`/api/v1${ruta}`, {
          method: metodo,
          headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
          body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        })
        if (!r.ok && r.status !== 409)
          throw new Error(`${metodo} ${ruta}: ${r.status} ${await r.text()}`)
        return r.status === 204 ? null : r.json()
      }
      const renovar = await (await fetch('/api/v1/auth/renovar', { method: 'POST' })).json()
      const admin = api(renovar.access_token)

      // Cuentas de ejemplo (datos ficticios), con la clave de las pruebas E2E.
      const cuentas = await admin('GET', '/usuarios')
      const cuenta = async ({ correo, nombre, rol }) => {
        const existente = cuentas.find((c) => c.correo === correo)
        if (existente) {
          await admin('PATCH', `/usuarios/${existente.id}`, { clave, activo: true })
          return existente
        }
        return admin('POST', '/usuarios', {
          correo,
          nombre_completo: nombre,
          rol,
          clave,
          autorizacion_datos: true,
        })
      }
      const agronoma = await cuenta(AGRONOMA)
      const tecnico = await cuenta(TECNICO)

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
      let predio = (await admin('GET', '/predios')).find((p) => p.nombre === PREDIO)
      const nuevo = !predio
      if (nuevo) {
        predio = await admin('POST', '/predios', {
          nombre: PREDIO,
          vereda: 'Icota',
          municipio: 'Cácota',
          registro_ica: '54-125-0042',
          limite: cuadro(-72.6448, 7.2642, -72.6382, 7.2683),
          color_limite: '#ff6b35',
        })
      }
      for (const persona of [agronoma, tecnico]) {
        await admin('PUT', `/predios/${predio.id}/usuarios/${persona.id}`)
      }
      if (!nuevo) return predio.id

      const dia = (n) => new Date(Date.now() + n * 86_400_000)
      const fecha = (d) =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d)
      const lotes = [
        {
          codigo: 'L-01',
          nombre: 'Lote del río',
          color: '#ffd60a',
          geom: cuadro(-72.644, 7.265, -72.6415, 7.2675),
        },
        {
          codigo: 'L-02',
          nombre: 'Lote alto',
          color: '#52b788',
          geom: cuadro(-72.6415, 7.265, -72.639, 7.2675),
        },
        {
          codigo: 'L-03',
          nombre: 'Lote de la casa',
          color: '#4cc9f0',
          geom: cuadro(-72.644, 7.2675, -72.6415, 7.268),
        },
      ]
      const creados = []
      for (const l of lotes)
        creados.push(await admin('POST', '/lotes', { predio_id: predio.id, ...l }))
      const puntos = [
        ['NS-CAC-0101', 0, 'jackson', -72.6432, 7.2662],
        ['NS-CAC-0102', 0, 'mcphail', -72.6424, 7.2668],
        ['NS-CAC-0103', 0, 'jackson', -72.6421, 7.2657],
        ['NS-CAC-0104', 1, 'jackson', -72.6402, 7.2663],
        ['NS-CAC-0105', 1, 'mcphail', -72.6398, 7.2669],
        ['NS-CAC-0106', 2, 'jackson', -72.643, 7.26775],
      ]
      const trampas = []
      for (const [codigo, lote, tipo, lng, lat] of puntos) {
        trampas.push(
          await admin('POST', '/trampas', {
            lote_id: creados[lote].id,
            codigo_ica: codigo,
            tipo,
            atrayente: tipo === 'jackson' ? 'Trimedlure' : 'Proteína hidrolizada',
            fecha_instalacion: fecha(dia(-40)),
            geom: { type: 'Point', coordinates: [lng, lat] },
          }),
        )
      }
      for (const lote of creados.slice(0, 2)) {
        const propuesta = await admin('GET', `/rutas/propuesta?lote_id=${lote.id}`)
        await admin('POST', '/rutas', {
          lote_id: lote.id,
          trampas: propuesta.paradas.map((p) => p.trampa_id),
        })
      }

      // Semana ISO de hoy (en Bogotá).
      const d = new Date(fecha(dia(0)) + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
      const anio = d.getUTCFullYear()
      const semana = Math.ceil(((d - Date.UTC(anio, 0, 1)) / 86_400_000 + 1) / 7)
      const inicio = Math.max(1, semana - 5)
      for (const lote of creados.slice(0, 2)) {
        await admin('POST', '/plan', {
          lote_id: lote.id,
          tipo: 'visita_monitoreo',
          anio,
          semana: inicio,
          responsable_id: tecnico.id,
          repetir: { cada_semanas: 1, hasta_semana: Math.min(52, semana + 8) },
        })
      }
      await admin('POST', '/plan', {
        lote_id: creados[0].id,
        tipo: 'cambio_atrayente',
        tipo_trampa: 'jackson',
        anio,
        semana: inicio + 1,
        responsable_id: tecnico.id,
        repetir: { cada_semanas: 4, hasta_semana: Math.min(52, semana + 10) },
      })
      await admin('POST', '/plan', {
        lote_id: creados[1].id,
        tipo: 'labor_cultural',
        labor: 'poda',
        anio,
        semana: semana + 2,
        responsable_id: agronoma.id,
        notas: 'Poda de formación después de la cosecha',
      })
      await admin('POST', '/plan', {
        lote_id: creados[0].id,
        tipo: 'labor_cultural',
        labor: 'fertilizacion',
        anio,
        semana,
        responsable_id: tecnico.id,
      })

      // Cuatro semanas de lecturas del técnico; las anteriores a esta semana, validadas.
      const campo = api(await token(TECNICO.correo))
      const capturas = [
        [2, 1, 0],
        [0, 0, 3],
        [1, 0, 0],
        [4, 2, 0],
        [0, 0, 1],
        [1, 1, 0],
        [3, 1, 0],
        [0, 0, 5],
        [2, 2, 0],
        [6, 3, 0],
        [0, 0, 2],
        [2, 0, 0],
        [1, 0, 0],
        [0, 0, 2],
        [0, 0, 0],
        [3, 2, 0],
        [0, 0, 4],
        [1, 0, 0],
        [5, 2, 0],
        [0, 0, 6],
        [2, 1, 0],
        [8, 4, 0],
        [0, 0, 3],
        [3, 1, 0],
      ]
      const lecturas = []
      let i = 0
      for (const atras of [28, 21, 14, 7]) {
        for (const t of trampas) {
          const [m, h, a] = capturas[i++]
          const [lng, lat] = t.geom.coordinates
          lecturas.push({
            id: crypto.randomUUID(),
            trampa_id: t.id,
            observado_en: new Date(Date.now() - atras * 86_400_000).toISOString(),
            capitata_machos: t.tipo === 'jackson' ? m : 0,
            capitata_hembras: t.tipo === 'jackson' ? h : 0,
            anastrepha: t.tipo === 'mcphail' ? a || m : 0,
            estado_trampa: 'buena',
            cambio_atrayente: false,
            posicion: { type: 'Point', coordinates: [lng + 0.00004, lat] },
            precision_m: 6,
          })
        }
      }
      // Esta semana: dos lecturas, una tomada lejos de la trampa (aviso al validar).
      for (const [t, lejos, machos] of [
        [trampas[0], false, 3],
        [trampas[3], true, 9],
      ]) {
        const [lng, lat] = t.geom.coordinates
        lecturas.push({
          id: crypto.randomUUID(),
          trampa_id: t.id,
          observado_en: new Date(Date.now() - 3_600_000).toISOString(),
          capitata_machos: machos,
          capitata_hembras: 2,
          anastrepha: 0,
          estado_trampa: 'buena',
          cambio_atrayente: false,
          observaciones: lejos ? 'Frutos maduros caídos alrededor de la trampa' : null,
          posicion: { type: 'Point', coordinates: [lng + (lejos ? 0.0021 : 0.00003), lat] },
          precision_m: 8,
        })
      }
      const { resultados } = await campo('POST', '/sync/lecturas', { lecturas })
      for (const r of resultados.slice(0, 24)) {
        if (r.lectura) {
          await admin('POST', `/visitas/lecturas/${r.id}/revision`, { estado: 'validada' })
        }
      }
      return predio.id
    },
    { PREDIO, AGRONOMA, TECNICO, clave: CLAVE },
  )
}

async function elegirPredio(page, predioId) {
  await page.evaluate((id) => localStorage.setItem('icota.predio', id), predioId)
}

let predioId

test('administrador y agrónomo', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize(ESCRITORIO)
  await page.goto('/')
  await captura(page, '01-inicio-sesion')
  await ingresar(page, CORREO, CLAVE)
  await expect(page).toHaveURL('/mapa')
  predioId = await sembrarDemostracion(page)
  await page.context().clearCookies()
  await page.goto('/')

  // Desde aquí, como la agrónoma de demostración (el administrador ve lo mismo y además
  // «Predio» completo y «Usuarios»).
  await ingresar(page, AGRONOMA.correo, CLAVE)
  await expect(page).toHaveURL('/mapa')
  await elegirPredio(page, predioId)
  await page.goto('/mapa')
  await captura(page, '02-mapa', { espera: 1500 })
  await page.locator('.marcador-trampa').first().click()
  await captura(page, '03-mapa-trampa', { espera: 900 })

  const demo = await elementos(page, predioId)
  await page.goto(`/lotes?lote=${demo.lotes['L-01']}`)
  await captura(page, '04-lotes', { espera: 1500 })
  await page.goto('/lotes')
  await captura(page, '05-lote-nuevo', { espera: 1200 })

  await page.goto(`/trampas?trampa=${demo.trampas['NS-CAC-0101'].id}`)
  await expect(page.getByRole('img', { name: /QR de la trampa/ })).toBeVisible()
  await captura(page, '06-trampa-ficha', { espera: 1500 })
  await page.getByRole('heading', { name: /Trampas del lote/ }).scrollIntoViewIfNeeded()
  await captura(page, '07-trampas-lista', { espera: 600 })
  await page.goto('/trampas')
  await captura(page, '08-trampa-nueva', { espera: 1200 })
  await descargar(page, `/api/v1/lotes/${demo.lotes['L-01']}/etiquetas.pdf`, 'etiquetas.pdf')

  await page.goto('/rutas')
  await captura(page, '09-rutas', { espera: 1500 })

  await page.goto('/plan')
  await captura(page, '10-plan', { espera: 1200 })
  await page
    .getByRole('button', { name: /^Ruta L-01 .*semana \d+: programada/ })
    .first()
    .click()
  await captura(page, '11-plan-ficha', { espera: 600 })
  await page
    .getByRole('button', { name: 'Reprogramar' })
    .click({ timeout: 5000 })
    .catch(() => {})
  await captura(page, '12-plan-reprogramar', { espera: 600 })
  await page.goto('/plan')
  await page.getByRole('button', { name: '+ Programar actividad' }).click()
  await captura(page, '13-plan-programar', { espera: 600 })

  await page.goto('/lecturas')
  await captura(page, '14-lecturas-bandeja', { espera: 1200 })
  await page
    .getByRole('button', { name: 'Rechazar…' })
    .first()
    .click({ timeout: 5000 })
    .catch(() => {})
  await captura(page, '15-lecturas-rechazar', { espera: 600 })

  await page.goto('/mtd')
  await page
    .getByLabel('Desde')
    .fill(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(
        new Date(Date.now() - 35 * 86_400_000),
      ),
    )
  await page.getByRole('button', { name: 'Calcular' }).click()
  await captura(page, '16-mtd', { espera: 1200 })
  await descargar(page, `/api/v1/mtd/reporte.pdf?predio_id=${predioId}`, 'reporte-mtd.pdf')
  await page.goto('/historial')
  await captura(page, '17-historial', { espera: 1200 })

  await page.goto('/predio')
  await captura(page, '18-predio-agronomo', { espera: 1500 })

  // Administración (cuenta de administrador).
  await page.context().clearCookies()
  await page.goto('/')
  await ingresar(page, CORREO, CLAVE)
  await expect(page).toHaveURL('/mapa')
  await elegirPredio(page, predioId)
  await page.goto('/predio')
  await captura(page, '19-predio-admin', { espera: 1500 })
  await page.getByRole('heading', { name: 'Todos los predios' }).scrollIntoViewIfNeeded()
  await captura(page, '20-predios-todos', { espera: 600 })
  await page.goto('/usuarios')
  await captura(page, '21-usuarios', { espera: 900 })
  await page
    .getByRole('button', { name: /Nuevo usuario/ })
    .click({ timeout: 5000 })
    .catch(() => {})
  await captura(page, '22-usuario-nuevo', { espera: 600 })
})

test('técnico en el teléfono', async ({ page, context }) => {
  test.setTimeout(120_000)
  await page.setViewportSize(TELEFONO)
  await page.goto('/')
  await captura(page, '30-telefono-inicio')
  await ingresar(page, TECNICO.correo, CLAVE)
  await expect(page).toHaveURL('/mapa')
  await elegirPredio(page, predioId)
  await page.goto('/mapa')
  await captura(page, '31-telefono-mapa', { espera: 1500 })
  await page.getByRole('button', { name: 'Menú' }).click()
  await captura(page, '32-telefono-menu')
  await page.getByRole('button', { name: 'Menú' }).click()

  await page.goto('/mi-semana')
  await captura(page, '33-telefono-mi-semana', { completa: true })

  // Ficha de la trampa al leer su QR y formulario de la lectura.
  // Una trampa sin lectura de hoy (al repetir el recorrido, las de antes ya la tienen).
  const trampa = await page.evaluate(async (id) => {
    const tk = (await (await fetch('/api/v1/auth/renovar', { method: 'POST' })).json()).access_token
    const h = { headers: { Authorization: `Bearer ${tk}` } }
    const lista = await (await fetch(`/api/v1/trampas?predio_id=${id}`, h)).json()
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
    for (const codigo of ['NS-CAC-0105', 'NS-CAC-0102', 'NS-CAC-0103', 'NS-CAC-0106']) {
      const t = lista.find((x) => x.codigo_ica === codigo)
      const prep = await (
        await fetch(`/api/v1/visitas/lecturas/preparar?trampa_id=${t.id}`, h)
      ).json()
      const ultima = prep.ultima_lectura?.observado_en
      const dia = ultima
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(ultima))
        : null
      if (dia !== hoy) return t
    }
    throw new Error('Todas las trampas de muestra ya tienen lectura hoy')
  }, predioId)
  const [lng, lat] = trampa.geom.coordinates
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: lat + 0.00005, longitude: lng, accuracy: 6 })
  await page.goto(`/t/${trampa.codigo_qr}`)
  await captura(page, '34-telefono-ficha-qr', { completa: true })
  await page.getByRole('link', { name: 'Registrar lectura' }).click()
  const formulario = page.getByRole('form', { name: 'Lectura de trampa' })
  await expect(formulario).toBeVisible()
  for (let n = 0; n < 4; n++) {
    await formulario
      .getByRole('button', { name: 'Sumar Anastrepha spp.' })
      .click({ timeout: 5000 })
      .catch(() => {})
  }
  await formulario.getByLabel('Observaciones').fill('Trampa en buen estado; se limpió el frasco')
  await captura(page, '35-telefono-lectura', { completa: true, espera: 1500 })
  await formulario.getByRole('button', { name: 'Registrar lectura' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'registrada' })).toBeVisible()
  await captura(page, '36-telefono-lectura-registrada', { completa: true })

  await page.goto('/lecturas')
  await captura(page, '37-telefono-lecturas', { completa: true, espera: 1200 })
})
