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
  cancelada: 'Cancelada',
}

const RECAMBIO = { jackson: 'Recambio trimedlure', mcphail: 'Recambio proteína' }
const TRAMPAS = { jackson: 'Trampas Jackson', mcphail: 'Trampas McPhail' }
const ORDEN_TIPOS = Object.keys(TIPOS_ACTIVIDAD)

// Fila de la vista anual a la que pertenece una actividad: lote + tipo (+ labor o trampa).
export function filaDe(actividad) {
  const { lote_id, lote_codigo, tipo, labor, tipo_trampa } = actividad
  const clave = [lote_id, tipo, labor ?? tipo_trampa ?? ''].join('|')
  if (tipo === 'visita_monitoreo') {
    return { clave, titulo: `Ruta ${lote_codigo}`, detalle: 'Monitoreo · trampeo' }
  }
  if (tipo === 'cambio_atrayente') {
    return {
      clave,
      titulo: RECAMBIO[tipo_trampa],
      detalle: `${TRAMPAS[tipo_trampa]} · ${lote_codigo}`,
    }
  }
  return { clave, titulo: LABORES[labor], detalle: `Cultivo · ${lote_codigo}` }
}

// Filas de la vista anual, ordenadas por lote y tipo, con las actividades de cada semana.
export function filasDelPlan(actividades) {
  const filas = new Map()
  for (const actividad of actividades) {
    const fila = filaDe(actividad)
    if (!filas.has(fila.clave)) {
      filas.set(fila.clave, {
        ...fila,
        lote: actividad.lote_codigo,
        tipo: actividad.tipo,
        semanas: new Map(),
      })
    }
    filas.get(fila.clave).semanas.set(actividad.semana, actividad)
  }
  return [...filas.values()].sort(
    (a, b) =>
      a.lote.localeCompare(b.lote, 'es', { numeric: true }) ||
      ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo) ||
      a.titulo.localeCompare(b.titulo, 'es'),
  )
}
