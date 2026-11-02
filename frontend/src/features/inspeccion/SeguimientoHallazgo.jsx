import { useEffect, useState } from 'react'

import {
  listarPersonal,
  marcarCumplida,
  obtenerHallazgo,
  programarAtencionHallazgo,
} from '../../api/client'
import { rangoSemana, semanaDelAnio, semanaIso, semanasDelAnio } from '../../utils/fechas'
import { ESTADOS_ACTIVIDAD } from '../plan/catalogo'
import { ROLES_GESTION } from '../usuarios/roles'
import { PENDIENTES } from './catalogo'

const ROLES_RESPONSABLE = ['tecnico', 'agronomo']
const mensajeDeError = (e, porDefecto) => (typeof e.detalle === 'string' ? e.detalle : porDefecto)

// Seguimiento de un hallazgo desde el plan (HU-42): el agrónomo o el administrador programan su
// atención en una semana con un responsable; al cumplirla (con una nota de lo que se hizo) el
// hallazgo queda atendido. La actividad se reprograma o elimina desde Planeación.
export default function SeguimientoHallazgo({ hallazgo, usuario, alCambiar }) {
  const gestion = ROLES_GESTION.includes(usuario.rol)
  const pendiente = hallazgo.atenciones.find((a) => PENDIENTES.includes(a.estado))
  const puedeCumplir = pendiente && (gestion || pendiente.responsable_id === usuario.id)
  const [programando, setProgramando] = useState(false)
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  async function ejecutar(accion, porDefecto) {
    setOcupado(true)
    setError(null)
    try {
      await accion()
      alCambiar(await obtenerHallazgo(hallazgo.id))
    } catch (e) {
      setError(mensajeDeError(e, porDefecto))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="seguimiento-hallazgo" aria-label="Seguimiento">
      <h3 className="formulario__seccion">Seguimiento</h3>
      {hallazgo.atenciones.length === 0 ? (
        <p className="formulario__nota">Sin atención programada en el plan.</p>
      ) : (
        <ul className="seguimiento-hallazgo__lista">
          {hallazgo.atenciones.map((a) => (
            <li key={a.id}>
              <div className="ficha-hallazgo__encabezado">
                <strong>
                  Semana {a.semana} · {rangoSemana(semanaDelAnio(a.anio, a.semana))}
                </strong>
                <span className={`insignia insignia--plan-${a.estado}`}>
                  {ESTADOS_ACTIVIDAD[a.estado]}
                </span>
              </div>
              {a.responsable_nombre && <span>Responsable: {a.responsable_nombre}</span>}
              {a.notas && <span>{a.notas}</span>}
              {a.nota_cumplimiento && <span>Qué se hizo: {a.nota_cumplimiento}</span>}
            </li>
          ))}
        </ul>
      )}

      {puedeCumplir && (
        <div className="formulario">
          <label htmlFor="nota_atencion">Qué se hizo (opcional)</label>
          <input
            id="nota_atencion"
            value={nota}
            maxLength={300}
            disabled={ocupado}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej. Poda sanitaria y aplicación de fungicida"
          />
          <button
            type="button"
            className="boton-primario"
            disabled={ocupado}
            onClick={() =>
              ejecutar(
                () => marcarCumplida(pendiente.id, true, nota.trim() || undefined),
                'No se pudo marcar la atención.',
              )
            }
          >
            Marcar atendido
          </button>
        </div>
      )}

      {gestion &&
        hallazgo.estado === 'abierto' &&
        (programando ? (
          <FormularioAtencion
            hallazgo={hallazgo}
            ocupado={ocupado}
            alProgramar={(datos) =>
              ejecutar(async () => {
                await programarAtencionHallazgo(datos)
                setProgramando(false)
              }, 'No se pudo programar la atención.')
            }
            alCancelar={() => setProgramando(false)}
          />
        ) : (
          <button
            type="button"
            className="boton-primario"
            onClick={() => {
              setError(null)
              setProgramando(true)
            }}
          >
            Programar atención
          </button>
        ))}
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function FormularioAtencion({ hallazgo, ocupado, alProgramar, alCancelar }) {
  const [id] = useState(() => crypto.randomUUID())
  const hoy = semanaIso()
  const [personal, setPersonal] = useState(null)
  const [datos, setDatos] = useState({
    anio: hoy.anio,
    semana: hoy.numero,
    responsable_id: '',
    notas: '',
  })

  useEffect(() => {
    let vigente = true
    listarPersonal(hallazgo.predio_id)
      .then((gente) => {
        if (!vigente) return
        const posibles = gente.filter((p) => p.activo && ROLES_RESPONSABLE.includes(p.rol))
        setPersonal(posibles)
        setDatos((d) => ({ ...d, responsable_id: d.responsable_id || posibles[0]?.id || '' }))
      })
      .catch(() => vigente && setPersonal([]))
    return () => {
      vigente = false
    }
  }, [hallazgo.predio_id])

  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }))
  const anios = [hoy.anio, hoy.anio + 1]
  const semanas = Array.from({ length: semanasDelAnio(Number(datos.anio)) }, (_, i) => i + 1)

  function enviar(evento) {
    evento.preventDefault()
    alProgramar({
      id,
      hallazgo_id: hallazgo.id,
      anio: Number(datos.anio),
      semana: Number(datos.semana),
      responsable_id: datos.responsable_id,
      ...(datos.notas.trim() && { notas: datos.notas.trim() }),
    })
  }

  return (
    <form className="formulario" onSubmit={enviar} aria-label="Programar atención">
      <fieldset disabled={ocupado}>
        <div className="formulario__fila">
          <div>
            <label htmlFor="atencion_anio">Año</label>
            <select id="atencion_anio" value={datos.anio} onChange={cambiar('anio')}>
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="atencion_semana">Semana</label>
            <select id="atencion_semana" value={datos.semana} onChange={cambiar('semana')}>
              {semanas.map((s) => (
                <option key={s} value={s}>
                  {s} · {rangoSemana(semanaDelAnio(Number(datos.anio), s))}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="atencion_responsable">Responsable</label>
        <select
          id="atencion_responsable"
          value={datos.responsable_id}
          onChange={cambiar('responsable_id')}
          required
        >
          {personal?.length === 0 && <option value="">Sin personal asignado al predio</option>}
          {personal?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre_completo}
            </option>
          ))}
        </select>
        <label htmlFor="atencion_notas">Qué hay que hacer (opcional)</label>
        <input
          id="atencion_notas"
          value={datos.notas}
          maxLength={300}
          onChange={cambiar('notas')}
          placeholder={hallazgo.titulo}
        />
        <div className="formulario__acciones">
          <button type="button" className="boton-secundario" onClick={alCancelar}>
            Cancelar
          </button>
          <button type="submit" className="boton-primario" disabled={!datos.responsable_id}>
            Programar en el plan
          </button>
        </div>
      </fieldset>
    </form>
  )
}
