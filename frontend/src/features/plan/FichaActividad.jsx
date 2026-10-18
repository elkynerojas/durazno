import { useEffect, useState } from 'react'

import { actualizarActividad, eliminarActividad, historialActividad } from '../../api/client'
import { rangoSemana, semanaDelAnio } from '../../utils/fechas'
import { ESTADOS_ACTIVIDAD, filaDe } from './catalogo'
import HistorialPlan from './HistorialPlan'
import Reprogramar from './Reprogramar'

// Actividad elegida en la vista anual. El agrónomo la reprograma con un motivo, cambia el
// responsable o la elimina (sola o con las siguientes de su serie). Muestra su historial.
export default function FichaActividad({
  actividad,
  editable,
  personal,
  alCambiar,
  alReprogramar,
  alEliminar,
}) {
  const fila = filaDe(actividad)
  const [responsable, setResponsable] = useState(actividad.responsable_id)
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [reprogramando, setReprogramando] = useState(false)
  const [historial, setHistorial] = useState(null)

  // Se vuelve a pedir cuando la actividad cambia (reprogramada o reasignada).
  useEffect(() => {
    let vigente = true
    historialActividad(actividad.id)
      .then((lista) => vigente && setHistorial(lista))
      .catch(() => vigente && setHistorial([]))
    return () => {
      vigente = false
    }
  }, [actividad.id, actividad.updated_at])

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

      {editable &&
        (reprogramando ? (
          <Reprogramar
            actividad={actividad}
            alReprogramar={(movida) => {
              setReprogramando(false)
              alReprogramar(movida)
            }}
            alCancelar={() => setReprogramando(false)}
          />
        ) : (
          <button
            type="button"
            className="boton-primario boton-bloque ficha__accion"
            onClick={() => setReprogramando(true)}
          >
            Reprogramar
          </button>
        ))}

      {editable && !reprogramando && (
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
      <h3 className="formulario__seccion">Historial</h3>
      {historial === null ? (
        <p className="cargando">Cargando…</p>
      ) : (
        <HistorialPlan cambios={historial} />
      )}
    </section>
  )
}
