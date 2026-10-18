// Catálogo del plan (HU-21); el mismo de GET /plan/catalogo.
export const TIPOS_ACTIVIDAD = {
  visita_monitoreo: 'Visita de monitoreo',
  cambio_atrayente: 'Cambio de atrayente',
  labor_cultural: 'Labor cultural',
}

export const LABORES = {
  poda: 'Poda',
  fertilizacion: 'Fertilización',
  raleo: 'Raleo de frutos',
  cosecha: 'Cosecha',
  riego: 'Riego',
  control_malezas: 'Control de malezas',
  otra: 'Otra labor',
}

export const ESTADOS_ACTIVIDAD = {
  programada: 'Programada',
  cumplida: 'Cumplida',
  reprogramada: 'Reprogramada',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
}

// «2 de 3 trampas leídas» (visitas) o «1 de 2 trampas con cambio de atrayente».
export function textoAvance(actividad) {
  const { avance, tipo } = actividad
  if (!avance) return null
  if (avance.total === 0) return 'Sin trampas activas por revisar'
  return tipo === 'visita_monitoreo'
    ? `${avance.hechas} de ${avance.total} trampas leídas`
    : `${avance.hechas} de ${avance.total} trampas con cambio de atrayente`
}

const RECAMBIO = { jackson: 'Recambio trimedlure', mcphail: 'Recambio proteína' }
const TRAMPAS = { jackson: 'Trampas Jackson', mcphail: 'Trampas McPhail' }
const ORDEN_LABORES = Object.keys(LABORES)
const porCodigo = (a, b) => a.localeCompare(b, 'es', { numeric: true })

// Fila de la vista anual (como el mockup): una ruta por lote; los recambios por tipo de trampa
// y las labores por labor, a nivel de predio. `nuevo` precarga «Programar actividad» desde una
// celda vacía de la fila.
export function filaDe(actividad) {
  const { lote_id, lote_codigo, tipo, labor, tipo_trampa } = actividad
  if (tipo === 'visita_monitoreo') {
    return {
      clave: `ruta|${lote_id}`,
      titulo: `Ruta ${lote_codigo}`,
      detalle: 'Monitoreo · trampeo',
      orden: [0, lote_codigo],
      nuevo: { tipo, lote_id },
    }
  }
  if (tipo === 'cambio_atrayente') {
    return {
      clave: `cambio|${tipo_trampa}`,
      titulo: RECAMBIO[tipo_trampa],
      detalle: TRAMPAS[tipo_trampa],
      orden: [1, tipo_trampa],
      nuevo: { tipo, tipo_trampa },
    }
  }
  return {
    clave: `labor|${labor}`,
    titulo: LABORES[labor],
    detalle: 'Cultivo',
    orden: [2, String(ORDEN_LABORES.indexOf(labor)).padStart(2, '0')],
    nuevo: { tipo, labor },
  }
}

// Estado de una celda con una o varias actividades (varios lotes): vencida si alguna lo está;
// si no, reprogramada; luego programada; cumplida solo si todas lo están.
export function estadoCombinado(actividades) {
  const estados = new Set(actividades.map((a) => a.estado))
  for (const estado of ['vencida', 'reprogramada', 'programada', 'cancelada']) {
    if (estados.has(estado) && (estado !== 'cancelada' || estados.size === 1)) return estado
  }
  return 'cumplida'
}

// Filas del calendario con sus actividades por semana. Aunque no haya actividades aparecen las
// rutas de los `lotesConRuta` ({ id, codigo }) y los dos recambios, como en el mockup.
export function filasDelPlan(actividades, lotesConRuta = []) {
  const filas = new Map()
  const asegurar = (fila) => {
    if (!filas.has(fila.clave)) filas.set(fila.clave, { ...fila, semanas: new Map() })
    return filas.get(fila.clave)
  }
  for (const lote of lotesConRuta) {
    asegurar(filaDe({ tipo: 'visita_monitoreo', lote_id: lote.id, lote_codigo: lote.codigo }))
  }
  for (const tipo_trampa of ['jackson', 'mcphail']) {
    asegurar(filaDe({ tipo: 'cambio_atrayente', tipo_trampa }))
  }
  for (const actividad of actividades) {
    const fila = asegurar(filaDe(actividad))
    fila.semanas.set(actividad.semana, [...(fila.semanas.get(actividad.semana) ?? []), actividad])
  }
  return [...filas.values()].sort(
    (a, b) => a.orden[0] - b.orden[0] || porCodigo(a.orden[1], b.orden[1]),
  )
}

// «lectura de 6 trampas» (visita), «9 trampas Jackson» (recambio) o el lote (labor).
export function detalleSemana(actividad) {
  const total = actividad.avance?.total
  if (actividad.tipo === 'visita_monitoreo') {
    return total
      ? `lectura de ${total} ${total === 1 ? 'trampa' : 'trampas'}`
      : 'sin trampas activas'
  }
  if (actividad.tipo === 'cambio_atrayente') {
    const n = total ?? 0
    const nombre = actividad.tipo_trampa === 'jackson' ? 'Jackson' : 'McPhail'
    return `${n} ${n === 1 ? 'trampa' : 'trampas'} ${nombre} · ${actividad.lote_codigo}`
  }
  return `Lote ${actividad.lote_codigo}`
}

const semana = (anio, numero, anioBase) =>
  anio === anioBase ? `S${numero}` : `S${numero} de ${anio}`

// Una línea del historial del plan (HU-23): qué cambió, quién y por qué.
export function describirCambio(cambio) {
  const desde = semana(cambio.anio_anterior, cambio.semana_anterior, cambio.anio_anterior)
  if (cambio.accion === 'reprogramada') {
    const hasta = semana(cambio.anio_nuevo, cambio.semana_nueva, cambio.anio_anterior)
    return `Reprogramada de ${desde} a ${hasta}`
  }
  if (cambio.accion === 'responsable') {
    return `Responsable: ${cambio.responsable_anterior} → ${cambio.responsable_nuevo}`
  }
  return `Eliminada (${desde})`
}
