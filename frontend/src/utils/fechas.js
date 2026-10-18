// Fechas presentadas en la zona horaria del predio (America/Bogota).
const ZONA = 'America/Bogota'
const DIA_MS = 86_400_000

// Fecha de calendario en Bogotá como Date UTC a medianoche (evita saltos por zona horaria).
function diaEnBogota(fecha) {
  const [a, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA })
    .format(fecha)
    .split('-')
    .map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

// Semana ISO 8601 (lunes a domingo; la semana 1 contiene el primer jueves del año).
export function semanaIso(fecha = new Date()) {
  const dia = diaEnBogota(fecha)
  const diaSemana = dia.getUTCDay() || 7
  const lunes = new Date(dia.getTime() - (diaSemana - 1) * DIA_MS)
  const jueves = new Date(lunes.getTime() + 3 * DIA_MS)
  const inicioAnio = new Date(Date.UTC(jueves.getUTCFullYear(), 0, 1))
  const numero = Math.floor((jueves - inicioAnio) / DIA_MS / 7) + 1
  return {
    numero,
    anio: jueves.getUTCFullYear(),
    lunes,
    domingo: new Date(lunes.getTime() + 6 * DIA_MS),
  }
}

const mesCorto = (fecha) =>
  new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' })
    .format(fecha)
    .replace('.', '')

// «12–18 oct 2026» o «29 sept – 5 oct 2026» si la semana cruza de mes.
export function rangoSemana({ lunes, domingo }) {
  const anio = domingo.getUTCFullYear()
  if (lunes.getUTCMonth() === domingo.getUTCMonth()) {
    return `${lunes.getUTCDate()}–${domingo.getUTCDate()} ${mesCorto(domingo)} ${anio}`
  }
  return `${lunes.getUTCDate()} ${mesCorto(lunes)} – ${domingo.getUTCDate()} ${mesCorto(domingo)} ${anio}`
}

// AAAA-MM-DD → DD/MM/AAAA (fechas de calendario, sin hora).
export function fechaCorta(iso) {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

// Semanas ISO del año (52 o 53): el 28 de diciembre siempre cae en la última.
export const semanasDelAnio = (anio) => semanaIso(new Date(Date.UTC(anio, 11, 28, 12))).numero

// Semana ISO a `delta` semanas de la dada (cruza de año si hace falta).
export function otraSemana({ anio, numero }, delta) {
  const jueves = semanaDelAnio(anio, numero).lunes.getTime() + (3 + 7 * delta) * DIA_MS
  // Al mediodía UTC, para que el día no cambie al pasarlo a la hora de Bogotá.
  return semanaIso(new Date(jueves + 12 * 3_600_000))
}

// Lunes y domingo de la semana ISO `numero` del año (la semana 1 contiene el 4 de enero).
export function semanaDelAnio(anio, numero) {
  const cuatroEnero = new Date(Date.UTC(anio, 0, 4))
  const lunes1 = new Date(cuatroEnero.getTime() - ((cuatroEnero.getUTCDay() || 7) - 1) * DIA_MS)
  const lunes = new Date(lunes1.getTime() + (numero - 1) * 7 * DIA_MS)
  return { numero, anio, lunes, domingo: new Date(lunes.getTime() + 6 * DIA_MS) }
}

// Momento (timestamptz) como fecha y hora de Bogotá: «17/10/2026 22:15».
export function fechaHora(iso) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('es-CO', {
      timeZone: ZONA,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  )
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`
}

// Bogotá no tiene horario de verano: siempre UTC−5.
const DESFASE_BOGOTA = '-05:00'

// Ahora en Bogotá como valor de <input type="datetime-local">: «2026-10-17T22:15».
export function ahoraLocalBogota(fecha = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

// Valor de <input type="datetime-local"> (hora de Bogotá) a ISO 8601 con zona.
export const localBogotaAIso = (valor) => `${valor}:00${DESFASE_BOGOTA}`
