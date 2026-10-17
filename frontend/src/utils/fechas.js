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
