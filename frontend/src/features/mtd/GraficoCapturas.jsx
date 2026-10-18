import { fechaCorta } from '../../utils/fechas'

const ANCHO = 640
const ALTO = 200
const MARGEN = { arriba: 16, derecha: 12, abajo: 28, izquierda: 36 }
const SERIES = [
  { clave: 'capitata', nombre: 'C. capitata', clase: 'grafico-capturas__capitata' },
  { clave: 'anastrepha', nombre: 'Anastrepha', clase: 'grafico-capturas__anastrepha' },
]

// Capturas por fecha (HU-27): dos barras por día, una por especie.
export default function GraficoCapturas({ serie }) {
  const maximo = Math.max(1, ...serie.flatMap((p) => [p.capitata, p.anastrepha]))
  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo
  const paso = anchoUtil / Math.max(serie.length, 1)
  const barra = Math.min(18, paso / 2.5)
  const y = (v) => MARGEN.arriba + altoUtil - (v / maximo) * altoUtil
  const cada = Math.ceil(serie.length / 8)
  const total = (clave) => serie.reduce((suma, p) => suma + p[clave], 0)

  return (
    <figure className="grafico-capturas">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label={`Capturas por fecha: ${total('capitata')} C. capitata y ${total('anastrepha')} Anastrepha en ${serie.length} fechas`}
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
              {Math.round(maximo * p)}
            </text>
          </g>
        ))}
        {serie.map((p, i) => {
          const centro = MARGEN.izquierda + paso * (i + 0.5)
          return (
            <g key={p.fecha}>
              {SERIES.map((s, j) => (
                <rect
                  key={s.clave}
                  x={centro - barra + j * barra}
                  y={y(p[s.clave])}
                  width={barra}
                  height={MARGEN.arriba + altoUtil - y(p[s.clave])}
                  className={s.clase}
                >
                  <title>{`${fechaCorta(p.fecha)} · ${s.nombre}: ${p[s.clave]}`}</title>
                </rect>
              ))}
              {i % cada === 0 && (
                <text x={centro} y={ALTO - 8} textAnchor="middle">
                  {fechaCorta(p.fecha).slice(0, 5)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption className="mapa-tarjeta__leyenda">
        {SERIES.map((s) => (
          <span key={s.clave}>
            <i className={`leyenda__muestra ${s.clase}`} />
            {s.nombre}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
