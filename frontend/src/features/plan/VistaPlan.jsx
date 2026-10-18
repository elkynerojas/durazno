import { useEffect, useState } from 'react'

import {
  cambiosDelPlan,
  cumplimientoPlan,
  listarPersonal,
  listarRutasPredio,
  obtenerPlan,
} from '../../api/client'
import Encabezado from '../../components/Encabezado'
import Plantilla from '../../components/Plantilla'
import { rangoSemana, semanaDelAnio, semanaIso, semanasDelAnio } from '../../utils/fechas'
import { useSesion } from '../auth/useSesion'
import { useDatosPredio } from '../mapa/useDatosPredio'
import { usePredio } from '../predios/usePredio'
import { ROLES_GESTION } from '../usuarios/roles'
import { ESTADOS_ACTIVIDAD, filaDe, filasDelPlan } from './catalogo'
import FichaActividad from './FichaActividad'
import FormularioActividad from './FormularioActividad'
import HistorialPlan from './HistorialPlan'
import RejillaPlan from './RejillaPlan'
import TarjetaCumplimiento from './TarjetaCumplimiento'

const ROLES_RESPONSABLE = ['tecnico', 'agronomo']

// Plan de actividades del año por semana ISO (HU-21).
export default function VistaPlan() {
  const { usuario } = useSesion()
  const editable = ROLES_GESTION.includes(usuario.rol)
  const { predio } = usePredio()
  const datos = useDatosPredio(predio.id)
  const hoy = semanaIso()
  const [anio, setAnio] = useState(hoy.anio)
  const [actividades, setActividades] = useState(null)
  const [error, setError] = useState(null)
  // Sube para volver a pedir el plan (tras eliminar una serie).
  const [version, setVersion] = useState(0)
  const [loteFiltro, setLoteFiltro] = useState('')
  const [seleccionada, setSeleccionada] = useState(null)
  const [programando, setProgramando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [personal, setPersonal] = useState([])
  const [lotesConRuta, setLotesConRuta] = useState(new Set())

  // Cambios recientes del plan del predio (HU-23); null mientras cargan.
  const [cambios, setCambios] = useState(null)
  const [cumplimiento, setCumplimiento] = useState(null)

  useEffect(() => {
    let vigente = true
    obtenerPlan(predio.id, anio)
      .then((lista) => vigente && setActividades(lista))
      .catch(() => vigente && setError('No se pudo cargar el plan del predio.'))
    cambiosDelPlan(predio.id)
      .then((lista) => vigente && setCambios(lista))
      .catch(() => vigente && setCambios([]))
    cumplimientoPlan(predio.id, anio)
      .then((datos) => vigente && setCumplimiento(datos))
      .catch(() => vigente && setCumplimiento(null))
    return () => {
      vigente = false
    }
  }, [predio.id, anio, version])

  useEffect(() => {
    if (!editable) return
    let vigente = true
    Promise.all([listarPersonal(predio.id), listarRutasPredio(predio.id)])
      .then(([gente, rutas]) => {
        if (!vigente) return
        setPersonal(gente.filter((p) => p.activo && ROLES_RESPONSABLE.includes(p.rol)))
        setLotesConRuta(new Set(rutas.map((r) => r.lote_id)))
      })
      .catch(() => vigente && setError('No se pudo cargar el personal del predio.'))
    return () => {
      vigente = false
    }
  }, [editable, predio.id])

  const totalSemanas = semanasDelAnio(anio)
  const semanaActual = anio === hoy.anio ? hoy.numero : null
  const visibles = (actividades ?? []).filter((a) => !loteFiltro || a.lote_id === loteFiltro)
  const deEstaSemana = visibles.filter((a) => a.semana === semanaActual)

  function cambiarAnio(delta) {
    setAnio((a) => a + delta)
    setActividades(null)
    setSeleccionada(null)
    setAviso(null)
  }

  function alProgramar(creadas) {
    setActividades((lista) => [...lista, ...creadas])
    setProgramando(false)
    setSeleccionada(creadas[0])
    setAviso(
      creadas.length === 1
        ? `Actividad programada en la semana ${creadas[0].semana}.`
        : `Se programaron ${creadas.length} actividades (semanas ${creadas[0].semana} a ${creadas.at(-1).semana}).`,
    )
  }

  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: predio.nombre, a: '/mapa' }, { texto: 'Planeación' }]}
        titulo={`Plan de actividades ${anio}`}
      >
        <div className="grupo-botones" role="group" aria-label="Año">
          <button
            type="button"
            className="boton-secundario"
            aria-label="Año anterior"
            onClick={() => cambiarAnio(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="boton-secundario"
            aria-label="Año siguiente"
            onClick={() => cambiarAnio(1)}
          >
            ›
          </button>
        </div>
        {datos.lotes.length > 0 && (
          <div className="filtro-lote">
            <label htmlFor="lote_plan_filtro">Lote</label>
            <select
              id="lote_plan_filtro"
              value={loteFiltro}
              onChange={(e) => setLoteFiltro(e.target.value)}
            >
              <option value="">Todos los lotes</option>
              {datos.lotes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo}
                </option>
              ))}
            </select>
          </div>
        )}
        {editable && datos.lotes.length > 0 && (
          <button
            type="button"
            className="boton-primario"
            onClick={() => {
              setProgramando(true)
              setSeleccionada(null)
              setAviso(null)
            }}
          >
            + Programar actividad
          </button>
        )}
      </Encabezado>
      {(error || datos.error) && (
        <p className="formulario__error" role="alert">
          {error ?? datos.error}
        </p>
      )}

      <section className="tarjeta" aria-labelledby="titulo-plan">
        <div className="ficha__encabezado">
          <h2 id="titulo-plan" className="tarjeta__titulo">
            {totalSemanas} semanas
          </h2>
          <div className="mapa-tarjeta__leyenda leyenda-plan">
            {['cumplida', 'programada', 'reprogramada', 'vencida'].map((estado) => (
              <span key={estado}>
                <i className={`leyenda__muestra celda-plan--${estado}`} />
                {ESTADOS_ACTIVIDAD[estado]}
              </span>
            ))}
            {semanaActual && (
              <span>
                <i className="leyenda__muestra leyenda__muestra--actual" />
                Semana actual (S{semanaActual})
              </span>
            )}
          </div>
        </div>
        {actividades === null ? (
          <p className="cargando">Cargando el plan…</p>
        ) : visibles.length === 0 ? (
          <p className="formulario__nota">
            No hay actividades programadas en {anio}
            {editable ? ': use «Programar actividad».' : '.'}
          </p>
        ) : (
          <RejillaPlan
            filas={filasDelPlan(visibles)}
            totalSemanas={totalSemanas}
            semanaActual={semanaActual}
            seleccionadaId={seleccionada?.id}
            alElegir={(actividad) => {
              setSeleccionada(actividad)
              setProgramando(false)
            }}
          />
        )}
      </section>

      {aviso && (
        <p className="formulario__exito" role="status">
          {aviso}
        </p>
      )}

      <div className="rejilla rejilla--dos">
        {semanaActual && actividades && (
          <section className="tarjeta" aria-labelledby="titulo-semana">
            <h2 id="titulo-semana" className="tarjeta__titulo">
              Semana {semanaActual} · {rangoSemana(semanaDelAnio(anio, semanaActual))}
            </h2>
            {deEstaSemana.length === 0 ? (
              <p className="formulario__nota">Sin actividades esta semana.</p>
            ) : (
              <ul className="lista-simple">
                {deEstaSemana.map((a) => (
                  <li key={a.id}>
                    <button type="button" className="enlace" onClick={() => setSeleccionada(a)}>
                      {filaDe(a).titulo}
                    </button>
                    <span>
                      {a.lote_codigo} · {a.responsable_nombre}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {programando && (
          <section className="tarjeta">
            <FormularioActividad
              anio={anio}
              semanaInicial={semanaActual ?? 1}
              lotes={datos.lotes}
              lotesConRuta={lotesConRuta}
              personal={personal}
              loteInicial={loteFiltro || undefined}
              alGuardar={alProgramar}
              alCancelar={() => setProgramando(false)}
            />
          </section>
        )}
        {seleccionada && !programando && (
          <FichaActividad
            key={seleccionada.id}
            actividad={seleccionada}
            editable={editable}
            personal={personal}
            alCambiar={(actualizada) => {
              setActividades((lista) =>
                lista.map((a) => (a.id === actualizada.id ? actualizada : a)),
              )
              setSeleccionada(actualizada)
              setAviso('Actividad actualizada.')
              setVersion((v) => v + 1)
            }}
            alReprogramar={(movida) => {
              setAviso(
                `${filaDe(movida).titulo} (${movida.lote_codigo}) quedó en la semana ${movida.semana}` +
                  (movida.anio === anio ? '.' : ` de ${movida.anio}.`),
              )
              setSeleccionada(movida.anio === anio ? movida : null)
              setVersion((v) => v + 1)
            }}
            alEliminar={() => {
              setSeleccionada(null)
              setAviso('Actividad eliminada.')
              setVersion((v) => v + 1)
            }}
          />
        )}
        {cumplimiento && <TarjetaCumplimiento cumplimiento={cumplimiento} />}
        {cambios?.length > 0 && (
          <section className="tarjeta" aria-labelledby="titulo-cambios">
            <h2 id="titulo-cambios" className="tarjeta__titulo">
              Cambios del plan
            </h2>
            <HistorialPlan cambios={cambios.slice(0, 10)} conActividad />
          </section>
        )}
      </div>
    </Plantilla>
  )
}
