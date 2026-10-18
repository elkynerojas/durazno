import { useEffect, useRef } from 'react'

import { ESTADOS_ACTIVIDAD } from './catalogo'

// Vista anual (HU-21): una fila por lote y actividad, una columna por semana ISO.
export default function RejillaPlan({
  filas,
  totalSemanas,
  semanaActual,
  seleccionadaId,
  alElegir,
}) {
  const semanas = Array.from({ length: totalSemanas }, (_, i) => i + 1)
  const ref = useRef(null)

  // Al abrir, desplaza la rejilla para que la semana actual quede a la vista (en el teléfono
  // solo caben unas pocas semanas).
  useEffect(() => {
    const contenedor = ref.current
    const actual = contenedor?.querySelector('[aria-current="date"]')
    const fija = contenedor?.querySelector('.rejilla-plan__actividad')
    if (!actual || !fija) return
    contenedor.scrollLeft = Math.max(
      0,
      actual.offsetLeft - fija.offsetWidth - 3 * actual.offsetWidth,
    )
  }, [semanaActual])

  return (
    <div ref={ref} className="rejilla-plan" role="region" aria-label="Semanas del año" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col" className="rejilla-plan__actividad">
              Actividad
            </th>
            {semanas.map((s) => (
              <th
                key={s}
                scope="col"
                className={s === semanaActual ? 'rejilla-plan__actual' : undefined}
                aria-current={s === semanaActual ? 'date' : undefined}
              >
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.clave}>
              <th scope="row" className="rejilla-plan__actividad">
                <strong>{fila.titulo}</strong>
                <span>{fila.detalle}</span>
              </th>
              {semanas.map((s) => {
                const actividad = fila.semanas.get(s)
                const clases = [
                  'celda-plan',
                  actividad && `celda-plan--${actividad.estado}`,
                  s === semanaActual && 'celda-plan--actual',
                ]
                return (
                  <td key={s} className={clases.filter(Boolean).join(' ')}>
                    {actividad && (
                      <button
                        type="button"
                        aria-pressed={actividad.id === seleccionadaId}
                        aria-label={`${fila.titulo} (${fila.detalle}), semana ${s}: ${ESTADOS_ACTIVIDAD[
                          actividad.estado
                        ].toLowerCase()}`}
                        onClick={() => alElegir(actividad)}
                      />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
