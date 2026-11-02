// Estado del hallazgo: se deriva de su actividad de atención en el plan (HU-42).
export const ESTADOS_HALLAZGO = {
  abierto: 'Abierto',
  en_atencion: 'En atención',
  atendido: 'Atendido',
}

export const MAX_EVIDENCIAS = 6
export const MAX_MB = 8

// «En atención · vencida» cuando la semana de la atención ya pasó sin cumplirse.
export const textoEstado = (hallazgo) =>
  ESTADOS_HALLAZGO[hallazgo.estado] + (hallazgo.vencida ? ' · vencida' : '')

// Atenciones del plan que siguen por hacer.
export const PENDIENTES = ['programada', 'reprogramada', 'vencida']
