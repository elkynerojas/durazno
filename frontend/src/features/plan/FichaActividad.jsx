import { useState } from 'react'

import { actualizarActividad, eliminarActividad } from '../../api/client'
import { rangoSemana, semanaDelAnio } from '../../utils/fechas'
import { ESTADOS_ACTIVIDAD, filaDe } from './catalogo'

// Actividad elegida en la vista anual. El agrónomo cambia el responsable o la elimina (sola o
// con las siguientes de su serie).
export default function FichaActividad({ actividad, editable, personal, alCambiar, alEliminar }) {
  const fila = filaDe(actividad)
  const [responsable, setResponsable] = useState(actividad.responsable_id)
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function ejecutar(accion) {
    setEnviando(true)
    setError(null)
    try {
      await accion()
    } catch (e) {
      setError(typeof e.detalle === 'string' ? e.detalle : 'No se pudo completar la acción.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="tarjeta" aria-label="Actividad seleccionada">
      <div className="ficha__encabezado">
        <p className="ficha__antetitulo">Semana {actividad.semana}</p>
        <span className={`insignia insignia--plan-${actividad.estado}`}>
          {ESTADOS_ACTIVIDAD[actividad.estado]}
        </span>
      </div>
      <p className="ficha__titulo">{fila.titulo}</p>
      <p className="ficha__subtitulo">{fila.detalle}</p>
      <dl className="ficha__datos">
        <dt>Fechas</dt>
        <dd>{rangoSemana(semanaDelAnio(actividad.anio, actividad.semana))}</dd>
        <dt>Responsable</dt>
        <dd>{actividad.responsable_nombre}</dd>
        {actividad.notas && (
          <>
            <dt>Notas</dt>
            <dd>{actividad.notas}</dd>
          </>
        )}
      </dl>

      {editable && (
        <div className="formulario">
          <label htmlFor="cambiar_responsable">Cambiar responsable</label>
          <div className="formulario__fila">
            <select
              id="cambiar_responsable"
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              disabled={enviando}
            >
              {personal.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre_completo}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="boton-secundario"
              disabled={enviando || responsable === actividad.responsable_id}
              onClick={() =>
                ejecutar(async () =>
                  alCambiar(
                    await actualizarActividad(actividad.id, { responsable_id: responsable }),
                  ),
                )
              }
            >
              Cambiar
            </button>
          </div>
          <div className="grupo-botones formulario__peligro">
            {confirmar ? (
              <>
                <button
                  type="button"
                  className="boton-peligro"
                  disabled={enviando}
                  onClick={() =>
                    ejecutar(async () => {
                      await eliminarActividad(actividad.id)
                      alEliminar()
                    })
                  }
                >
                  Eliminar solo esta
                </button>
                {actividad.serie_id && (
                  <button
                    type="button"
                    className="boton-peligro"
                    disabled={enviando}
                    onClick={() =>
                      ejecutar(async () => {
                        await eliminarActividad(actividad.id, true)
                        alEliminar()
                      })
                    }
                  >
                    Eliminar esta y las siguientes
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="boton-secundario" onClick={() => setConfirmar(true)}>
                Eliminar actividad
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
