import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { marcarCumplida, misActividades } from '../../api/client'
import Encabezado from '../../components/Encabezado'
import Plantilla from '../../components/Plantilla'
import { otraSemana, rangoSemana, semanaIso } from '../../utils/fechas'
import { usePredio } from '../predios/usePredio'
import { ESTADOS_ACTIVIDAD, filaDe, textoAvance } from './catalogo'

// «Mi semana» (HU-24): lo que le toca al usuario esta semana, en todos sus predios. Pensada para
// el teléfono: tarjetas grandes y acceso directo a la ruta en el mapa.
export default function VistaMiSemana() {
  const { predios, seleccionar } = usePredio()
  const navigate = useNavigate()
  const hoy = semanaIso()
  const [semana, setSemana] = useState({ anio: hoy.anio, numero: hoy.numero })
  const [respuesta, setRespuesta] = useState(null)
  const [error, setError] = useState(null)
  const variosPredios = (predios?.length ?? 0) > 1
  const esEsta = semana.anio === hoy.anio && semana.numero === hoy.numero

  useEffect(() => {
    let vigente = true
    misActividades(semana.anio, semana.numero)
      .then((datos) => vigente && setRespuesta(datos))
      .catch(() => vigente && setError('No se pudieron cargar sus actividades.'))
    return () => {
      vigente = false
    }
  }, [semana])

  function moverse(delta) {
    const { anio, numero } = otraSemana(semana, delta)
    setSemana({ anio, numero })
    setRespuesta(null)
  }

  async function alternarCumplida(actividad) {
    setError(null)
    try {
      const actualizada = await marcarCumplida(actividad.id, actividad.estado !== 'cumplida')
      setRespuesta((r) => ({
        ...r,
        actividades: r.actividades.map((a) =>
          a.id === actualizada.id ? { ...a, ...actualizada } : a,
        ),
      }))
    } catch {
      setError('No se pudo actualizar la labor. Intente de nuevo.')
    }
  }

  // Abre la vista en el predio de la actividad (puede no ser el elegido en el menú).
  function ir(actividad, ruta) {
    seleccionar(actividad.predio_id)
    navigate(ruta)
  }

  const actividades =
    respuesta?.anio === semana.anio && respuesta?.semana === semana.numero
      ? respuesta.actividades
      : null

  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: 'Planeación', a: '/plan' }, { texto: 'Mi semana' }]}
        titulo={esEsta ? 'Mi semana' : `Semana ${semana.numero}`}
      >
        <div className="grupo-botones" role="group" aria-label="Semana">
          <button
            type="button"
            className="boton-secundario"
            aria-label="Semana anterior"
            onClick={() => moverse(-1)}
          >
            ‹
          </button>
          {!esEsta && (
            <button
              type="button"
              className="boton-secundario"
              onClick={() => {
                setSemana({ anio: hoy.anio, numero: hoy.numero })
                setRespuesta(null)
              }}
            >
              Esta semana
            </button>
          )}
          <button
            type="button"
            className="boton-secundario"
            aria-label="Semana siguiente"
            onClick={() => moverse(1)}
          >
            ›
          </button>
        </div>
      </Encabezado>
      <p className="mi-semana__rango">
        Semana {semana.numero} · {rangoSemana(otraSemana(semana, 0))}
      </p>
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      {!error && actividades === null && <p className="cargando">Cargando sus actividades…</p>}
      {actividades?.length === 0 && (
        <section className="tarjeta">
          <p>No tiene actividades asignadas {esEsta ? 'esta semana' : 'en esa semana'}.</p>
        </section>
      )}
      {actividades?.length > 0 && (
        <ul className="mi-semana" aria-label="Actividades de la semana">
          {actividades.map((actividad) => {
            const fila = filaDe(actividad)
            const visita = actividad.tipo === 'visita_monitoreo'
            return (
              <li key={actividad.id} className="tarjeta mi-semana__actividad">
                <div className="ficha__encabezado">
                  <p className="ficha__titulo">{fila.titulo}</p>
                  <span className={`insignia insignia--plan-${actividad.estado}`}>
                    {ESTADOS_ACTIVIDAD[actividad.estado]}
                  </span>
                </div>
                <p className="ficha__subtitulo">
                  Lote {actividad.lote_codigo}
                  {variosPredios && ` · ${actividad.predio_nombre}`}
                  {visita &&
                    (actividad.ruta_paradas
                      ? ` · ruta de ${actividad.ruta_paradas} ${actividad.ruta_paradas === 1 ? 'trampa' : 'trampas'}`
                      : ' · sin ruta vigente')}
                  {!visita && ` · ${fila.detalle.split(' · ')[0]}`}
                </p>
                {textoAvance(actividad) && (
                  <p className="formulario__nota">{textoAvance(actividad)}</p>
                )}
                {actividad.notas && <p className="formulario__nota">{actividad.notas}</p>}
                {actividad.tipo === 'labor_cultural' && (
                  <button
                    type="button"
                    className="boton-secundario boton-bloque"
                    onClick={() => alternarCumplida(actividad)}
                  >
                    {actividad.estado === 'cumplida' ? 'Desmarcar cumplida' : 'Marcar cumplida'}
                  </button>
                )}
                <button
                  type="button"
                  className={
                    visita ? 'boton-primario boton-bloque' : 'boton-secundario boton-bloque'
                  }
                  onClick={() =>
                    ir(
                      actividad,
                      visita
                        ? `/rutas?lote=${actividad.lote_id}`
                        : `/lotes?lote=${actividad.lote_id}`,
                    )
                  }
                >
                  {visita ? 'Ver la ruta en el mapa' : 'Ver el lote en el mapa'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Plantilla>
  )
}
