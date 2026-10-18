import { useEffect, useRef } from 'react'

import { ESTADOS_ACTIVIDAD, estadoCombinado } from './catalogo'

// Calendario anual (HU-21, mockup 05): una fila por ruta, recambio o labor y una columna por
// semana ISO. Tocar una celda con actividades las abre; tocar una vacía (con `alProgramar`)
// programa una nueva en esa semana.
export default function RejillaPlan({
  filas,
  totalSemanas,
  semanaActual,
  seleccionadas = [],
  alElegir,
  alProgramar,
}) {
  const semanas = Array.from({ length: totalSemanas }, (_, i) => i + 1)
  const ref = useRef(null)
  const elegidas = new Set(seleccionadas.map((a) => a.id))

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
                const actividades = fila.semanas.get(s) ?? []
                const estado = actividades.length ? estadoCombinado(actividades) : null
                const clases = [
                  'celda-plan',
                  estado && `celda-plan--${estado}`,
                  s === semanaActual && 'celda-plan--actual',
                ]
                return (
                  <td key={s} className={clases.filter(Boolean).join(' ')}>
                    {estado ? (
                      <button
                        type="button"
                        aria-pressed={actividades.some((a) => elegidas.has(a.id))}
                        aria-label={`${fila.titulo} (${fila.detalle}), semana ${s}: ${ESTADOS_ACTIVIDAD[
                          estado
                        ].toLowerCase()}${actividades.length > 1 ? ` · ${actividades.length} actividades` : ''}`}
                        onClick={() => alElegir(actividades)}
                      />
                    ) : (
                      alProgramar && (
                        <button
                          type="button"
                          className="celda-plan__vacia"
                          aria-label={`Programar ${fila.titulo}, semana ${s}`}
                          onClick={() => alProgramar({ ...fila.nuevo, semana: s })}
                        />
                      )
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
