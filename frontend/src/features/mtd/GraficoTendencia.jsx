import { formatoMtd } from './formato'

const ANCHO = 640
const ALTO = 200
const MARGEN = { arriba: 16, derecha: 12, abajo: 28, izquierda: 48 }

// Tendencia semanal del MTD en SVG. Las semanas sin dato cortan la línea.
export default function GraficoTendencia({ filas, titulo }) {
  const valores = filas.map((f) => f.mtd).filter((v) => v !== null)
  const maximo = Math.max(...valores, 0.1)
  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo
  const x = (i) =>
    MARGEN.izquierda + (filas.length > 1 ? (i * anchoUtil) / (filas.length - 1) : anchoUtil / 2)
  const y = (v) => MARGEN.arriba + altoUtil - (v / maximo) * altoUtil

  // Tramos continuos entre semanas con dato.
  const tramos = []
  filas.forEach((f, i) => {
    if (f.mtd === null) return
    const anterior = filas[i - 1]
    if (!anterior || anterior.mtd === null) tramos.push([])
    tramos.at(-1).push(`${x(i)},${y(f.mtd)}`)
  })
  const cada = Math.ceil(filas.length / 8)

  return (
    <svg
      className="grafico-mtd"
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label={`${titulo}: ${valores.length} de ${filas.length} semanas con dato`}
    >
      {[0, 0.5, 1].map((p) => (
        <g key={p}>
          <line
            x1={MARGEN.izquierda}
            x2={ANCHO - MARGEN.derecha}
            y1={y(maximo * p)}
            y2={y(maximo * p)}
            className="grafico-mtd__guia"
          />
          <text x={MARGEN.izquierda - 6} y={y(maximo * p) + 4} textAnchor="end">
            {formatoMtd.format(maximo * p)}
          </text>
        </g>
      ))}
      {tramos.map((puntos) => (
        <polyline key={puntos[0]} points={puntos.join(' ')} className="grafico-mtd__linea" />
      ))}
      {filas.map(
        (f, i) =>
          f.mtd !== null && (
            <circle
              key={`p-${f.anio}-${f.semana}`}
              cx={x(i)}
              cy={y(f.mtd)}
              r={4}
              className="grafico-mtd__punto"
            >
              <title>{`S${f.semana}: ${formatoMtd.format(f.mtd)}`}</title>
            </circle>
          ),
      )}
      {filas.map(
        (f, i) =>
          i % cada === 0 && (
            <text key={`e-${f.anio}-${f.semana}`} x={x(i)} y={ALTO - 8} textAnchor="middle">
              S{f.semana}
            </text>
          ),
      )}
    </svg>
  )
}
