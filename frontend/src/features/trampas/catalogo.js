// Tipos de trampa del Manual Técnico de Trampeo del ICA, con su atrayente habitual.
export const TIPOS_TRAMPA = {
  jackson: { nombre: 'Jackson', sigla: 'J', atrayente: 'Trimedlure' },
  mcphail: { nombre: 'McPhail', sigla: 'M', atrayente: 'Proteína hidrolizada' },
}

export const ESTADOS_TRAMPA = { activa: 'Activa', inactiva: 'Inactiva', retirada: 'Retirada' }

// Fecha de hoy (AAAA-MM-DD) en la zona horaria del predio.
export const hoyEnBogota = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
