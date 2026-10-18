export const dias = (n) => (n === 1 ? '1 día' : `${n} días`)

// Días sin revisión de una trampa (desde la última lectura o, si no tiene, desde la instalación).
export function textoRevision(trampa) {
  if (!trampa.monitoreo) return 'No se monitorea (trampa no activa)'
  if (trampa.dias_sin_revision === 0) return 'Instalada o revisada hoy'
  const desde = trampa.ultima_lectura ? 'desde la última lectura' : 'desde la instalación'
  return `${dias(trampa.dias_sin_revision)} ${desde}`
}
