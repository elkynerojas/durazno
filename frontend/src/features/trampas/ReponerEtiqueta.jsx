import { useEffect, useState } from 'react'

import { listarReemplazosQr, obtenerEtiquetaTrampa, reemplazarQr } from '../../api/client'
import { descargar } from '../../utils/descargas'

const fecha = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
})

// Reponer una etiqueta deteriorada (HU-17): reimprimirla con el mismo código o reemplazarla por
// un código nuevo que invalida el anterior. `puedeReemplazar`: técnico o agrónomo.
export default function ReponerEtiqueta({ trampa, puedeReemplazar, alReemplazar }) {
  // El id se genera una sola vez por reemplazo: reintentar no genera otro código.
  const [id, setId] = useState(() => globalThis.crypto?.randomUUID?.())
  const [confirmando, setConfirmando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [historial, setHistorial] = useState([])

  const trampaId = trampa.id
  useEffect(() => {
    let vigente = true
    listarReemplazosQr(trampaId)
      .then((filas) => vigente && setHistorial(filas))
      .catch(() => vigente && setHistorial([]))
    return () => {
      vigente = false
    }
  }, [trampaId, trampa.codigo_qr])

  async function reimprimir() {
    setError(null)
    try {
      descargar(await obtenerEtiquetaTrampa(trampa.id), `etiqueta-${trampa.codigo_qr}.pdf`)
    } catch {
      setError('No se pudo generar la etiqueta.')
    }
  }

  async function reemplazar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const actualizada = await reemplazarQr(trampa.id, {
        ...(id && { id }),
        ...(motivo.trim() && { motivo: motivo.trim() }),
      })
      setConfirmando(false)
      setMotivo('')
      setId(globalThis.crypto?.randomUUID?.())
      alReemplazar(actualizada)
    } catch (e) {
      setError(typeof e.detalle === 'string' ? e.message : 'No se pudo reemplazar la etiqueta.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="reponer" aria-labelledby="titulo-reponer">
      <h3 id="titulo-reponer" className="reponer__titulo">
        ¿Etiqueta dañada?
      </h3>
      <div className="grupo-botones">
        <button type="button" className="boton-secundario" onClick={reimprimir}>
          Reimprimir etiqueta
        </button>
        {puedeReemplazar && !confirmando && trampa.estado !== 'retirada' && (
          <button type="button" className="boton-secundario" onClick={() => setConfirmando(true)}>
            Reemplazar etiqueta
          </button>
        )}
      </div>

      {confirmando && (
        <form className="formulario reponer__confirmar" onSubmit={reemplazar}>
          <p className="formulario__aviso">
            Se generará un código nuevo y la etiqueta {trampa.codigo_qr} dejará de servir. Instale
            la etiqueta nueva en la trampa.
          </p>
          <label htmlFor="motivo_reemplazo">Motivo (opcional)</label>
          <input
            id="motivo_reemplazo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={200}
            placeholder="Ej. etiqueta borrosa por la lluvia"
          />
          <div className="formulario__acciones formulario__acciones--inicio">
            <button type="submit" className="boton-peligro" disabled={enviando}>
              {enviando ? 'Reemplazando…' : 'Confirmar reemplazo'}
            </button>
            <button
              type="button"
              className="boton-secundario"
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}

      {historial.length > 0 && (
        <>
          <p className="etiqueta">Reemplazos anteriores</p>
          <ul className="lista-simple reponer__historial">
            {historial.map((r) => (
              <li key={r.id}>
                <span>
                  <span className="mono">{r.codigo_anterior}</span> →{' '}
                  <span className="mono">{r.codigo_nuevo}</span>
                  {r.motivo ? ` · ${r.motivo}` : ''}
                </span>
                <span>
                  {fecha.format(new Date(r.created_at))} · {r.responsable}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
