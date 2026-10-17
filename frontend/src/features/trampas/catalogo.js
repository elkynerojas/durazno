// Tipos de trampa del Manual Técnico de Trampeo del ICA, con su atrayente habitual.
export const TIPOS_TRAMPA = {
  jackson: {
    nombre: 'Jackson',
    atrayente: 'Trimedlure',
    vigilancia: 'Vigilancia de',
    especie: 'Ceratitis capitata',
  },
  mcphail: {
    nombre: 'McPhail',
    atrayente: 'Proteína hidrolizada',
    vigilancia: 'Especies nativas de',
    especie: 'Anastrepha',
  },
}

export const ESTADOS_TRAMPA = { activa: 'Activa', inactiva: 'Inactiva', retirada: 'Retirada' }

// Fecha de hoy (AAAA-MM-DD) en la zona horaria del predio.
export const hoyEnBogota = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
