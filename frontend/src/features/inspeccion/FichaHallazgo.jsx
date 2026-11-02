import { useState } from 'react'

import {
  eliminarEvidencia,
  eliminarHallazgo,
  obtenerHallazgo,
  subirEvidencia,
} from '../../api/client'
import { fechaHora } from '../../utils/fechas'
import { ROLES_GESTION } from '../usuarios/roles'
import { MAX_EVIDENCIAS, MAX_MB, textoEstado } from './catalogo'
import GaleriaEvidencias from './GaleriaEvidencias'
import SeguimientoHallazgo from './SeguimientoHallazgo'

const mensajeDeError = (e, porDefecto) => (typeof e.detalle === 'string' ? e.detalle : porDefecto)

// Detalle de un hallazgo con sus fotos. Agregan o quitan fotos quien lo registró, el agrónomo y
// el administrador; lo eliminan el agrónomo y el administrador.
export default function FichaHallazgo({ hallazgo, usuario, alCambiar, alEliminar, alCerrar }) {
  const gestion = ROLES_GESTION.includes(usuario.rol)
  const editable = gestion || hallazgo.registrado_por_id === usuario.id
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  async function recargar() {
    alCambiar(await obtenerHallazgo(hallazgo.id))
  }

  async function agregarFotos(evento) {
    const archivos = [...evento.target.files].slice(0, MAX_EVIDENCIAS - hallazgo.evidencias.length)
    evento.target.value = ''
    setOcupado(true)
    setError(null)
    try {
      for (const archivo of archivos) {
        await subirEvidencia(hallazgo.id, archivo, crypto.randomUUID())
      }
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo subir la foto.'))
    }
    await recargar().catch(() => {})
    setOcupado(false)
  }

  async function quitarFoto(evidencia) {
    setOcupado(true)
    setError(null)
    try {
      await eliminarEvidencia(hallazgo.id, evidencia.id)
      await recargar()
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo eliminar la foto.'))
    } finally {
      setOcupado(false)
    }
  }

  async function eliminar() {
    setOcupado(true)
    setError(null)
    try {
      await eliminarHallazgo(hallazgo.id)
      alEliminar(hallazgo.id)
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo eliminar el hallazgo.'))
      setOcupado(false)
    }
  }

  return (
    <article className="ficha-hallazgo" aria-label={`Hallazgo ${hallazgo.titulo}`}>
      <div className="ficha-hallazgo__encabezado">
        <span className="tipo-hallazgo">
          <span
            className="tipo-hallazgo__muestra"
            style={{ background: hallazgo.tipo_color }}
            aria-hidden="true"
          />
          {hallazgo.tipo_nombre}
        </span>
        <span className={`insignia insignia--hallazgo-${hallazgo.estado}`}>
          {textoEstado(hallazgo)}
        </span>
      </div>
      <h2 className="tarjeta__titulo">{hallazgo.titulo}</h2>
      <dl className="ficha__datos">
        <dt>Lote</dt>
        <dd>{hallazgo.lote_codigo}</dd>
        <dt>Observado</dt>
        <dd>{fechaHora(hallazgo.observado_en)}</dd>
        {hallazgo.registrado_por_nombre && (
          <>
            <dt>Registró</dt>
            <dd>{hallazgo.registrado_por_nombre}</dd>
          </>
        )}
        <dt>Ubicación</dt>
        <dd>
          {hallazgo.precision_m != null
            ? `GPS, precisión ±${Math.round(hallazgo.precision_m)} m`
            : 'Marcada en el mapa'}
        </dd>
      </dl>
      <p className="ficha-hallazgo__descripcion">{hallazgo.descripcion}</p>

      <SeguimientoHallazgo hallazgo={hallazgo} usuario={usuario} alCambiar={alCambiar} />

      <h3 className="formulario__seccion">Evidencias</h3>
      <GaleriaEvidencias
        hallazgoId={hallazgo.id}
        evidencias={hallazgo.evidencias}
        alQuitar={editable && !ocupado ? quitarFoto : undefined}
      />
      {editable && hallazgo.evidencias.length < MAX_EVIDENCIAS && (
        <label className="boton-secundario boton-archivo" aria-disabled={ocupado}>
          {ocupado ? 'Subiendo…' : 'Agregar fotos'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={ocupado}
            onChange={agregarFotos}
          />
        </label>
      )}
      {editable && (
        <p className="formulario__nota">
          Hasta {MAX_EVIDENCIAS} fotos de máximo {MAX_MB} MB.
        </p>
      )}

      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      <div className="formulario__acciones">
        <button type="button" className="boton-secundario" onClick={alCerrar}>
          Cerrar
        </button>
        {gestion &&
          (confirmando ? (
            <button type="button" className="boton-peligro" disabled={ocupado} onClick={eliminar}>
              Confirmar: eliminar hallazgo
            </button>
          ) : (
            <button type="button" className="boton-secundario" onClick={() => setConfirmando(true)}>
              Eliminar hallazgo
            </button>
          ))}
      </div>
    </article>
  )
}
