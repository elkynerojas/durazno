import { useState } from 'react'

import { marcarCumplida } from '../../api/client'
import { rangoSemana, semanaDelAnio } from '../../utils/fechas'
import { detalleSemana, filaDe } from './catalogo'

const mesCorto = (texto) => texto.replace(/ \d{4}$/, '')
// Vencidas recientes que se arrastran a la lista (como «vencida desde S41» del mockup); las más
// antiguas solo se cuentan.
const SEMANAS_ARRASTRE = 2

// La semana actual como lista de chequeo (mockup 05): lo de esta semana y, al final, lo vencido
// de semanas anteriores. La casilla de las labores las marca cumplidas; las visitas y los
// recambios se cumplen con las lecturas.
export default function SemanaActual({
  anio,
  semana,
  actividades,
  puedeMarcar,
  alElegir,
  alCambiar,
}) {
  const [error, setError] = useState(null)
  const deLaSemana = actividades.filter((a) => a.semana === semana)
  const todasVencidas = actividades.filter((a) => a.semana < semana && a.estado === 'vencida')
  const vencidas = todasVencidas
    .filter((a) => a.semana >= semana - SEMANAS_ARRASTRE)
    .sort((a, b) => a.semana - b.semana)
  const antiguas = todasVencidas.length - vencidas.length
  const cumplidas = deLaSemana.filter((a) => a.estado === 'cumplida').length

  async function alternar(actividad) {
    setError(null)
    try {
      alCambiar(await marcarCumplida(actividad.id, actividad.estado !== 'cumplida'))
    } catch {
      setError('No se pudo actualizar la labor.')
    }
  }

  const fila = (actividad, vencidaDesde) => {
    const labor = actividad.tipo === 'labor_cultural'
    return (
      <li key={actividad.id} className="semana-plan__item">
        <input
          type="checkbox"
          aria-label={`${filaDe(actividad).titulo} cumplida`}
          checked={actividad.estado === 'cumplida'}
          disabled={!labor || !puedeMarcar(actividad)}
          onChange={() => alternar(actividad)}
        />
        <div>
          <p>
            <button type="button" className="enlace" onClick={() => alElegir([actividad])}>
              {filaDe(actividad).titulo}
            </button>{' '}
            · {detalleSemana(actividad)}
            {vencidaDesde && (
              <span className="semana-plan__vencida"> · vencida desde S{vencidaDesde}</span>
            )}
          </p>
          <p className="semana-plan__detalle">{actividad.responsable_nombre}</p>
        </div>
      </li>
    )
  }

  return (
    <section className="tarjeta" aria-labelledby="titulo-semana">
      <div className="ficha__encabezado">
        <h2 id="titulo-semana" className="tarjeta__titulo">
          Semana {semana} · {mesCorto(rangoSemana(semanaDelAnio(anio, semana)))}
        </h2>
        {deLaSemana.length > 0 && (
          <span className="formulario__nota">
            {cumplidas} de {deLaSemana.length} cumplidas
          </span>
        )}
      </div>
      {deLaSemana.length === 0 && vencidas.length === 0 ? (
        <p className="formulario__nota">Sin actividades esta semana.</p>
      ) : (
        <ul className="semana-plan" aria-label="Actividades de la semana">
          {deLaSemana.map((a) => fila(a))}
          {vencidas.map((a) => fila(a, a.semana))}
        </ul>
      )}
      {antiguas > 0 && (
        <p className="formulario__nota">
          Y {antiguas} {antiguas === 1 ? 'vencida' : 'vencidas'} de semanas anteriores (en rojo en
          el calendario).
        </p>
      )}
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
