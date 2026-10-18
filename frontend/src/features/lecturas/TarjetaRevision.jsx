import { useState } from 'react'
import { Link } from 'react-router'

import { revisarLectura } from '../../api/client'
import { fechaHora } from '../../utils/fechas'
import { ESTADOS_TRAMPA_LECTURA } from './catalogo'

const ESTADOS = { registrada: 'Pendiente', validada: 'Validada', rechazada: 'Rechazada' }
const INSIGNIAS = { registrada: 'inactiva', validada: 'activa', rechazada: 'retirada' }

// Una lectura en la bandeja de validación (HU-26): datos, avisos y acciones del agrónomo.
export default function TarjetaRevision({ lectura, editable, alRevisar }) {
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const capitata = lectura.capitata_machos + lectura.capitata_hembras

  async function revisar(datos) {
    setEnviando(true)
    setError(null)
    try {
      // Con el estado que se vio: si otra persona ya la revisó, la API responde 409.
      alRevisar(await revisarLectura(lectura.id, { ...datos, estado_esperado: lectura.estado }))
    } catch (e) {
      setError(typeof e.detalle === 'string' ? e.detalle : 'No se pudo guardar la revisión.')
      setEnviando(false)
    }
  }

  return (
    <li className="tarjeta tarjeta-revision" aria-label={`Lectura de ${lectura.trampa_codigo_ica}`}>
      <div className="ficha__encabezado">
        <p className="ficha__titulo">
          <Link to={`/trampas?trampa=${lectura.trampa_id}`}>{lectura.trampa_codigo_ica}</Link>
        </p>
        <span className={`insignia insignia--${INSIGNIAS[lectura.estado]}`}>
          {ESTADOS[lectura.estado]}
        </span>
      </div>
      <p className="ficha__subtitulo">
        Lote {lectura.lote_codigo} · {fechaHora(lectura.observado_en)}
        {lectura.responsable_nombre && ` · ${lectura.responsable_nombre}`}
      </p>
      <dl className="ficha__datos">
        <dt>C. capitata</dt>
        <dd>
          {capitata} ({lectura.capitata_machos} ♂ · {lectura.capitata_hembras} ♀)
        </dd>
        <dt>Anastrepha</dt>
        <dd>{lectura.anastrepha}</dd>
        <dt>Exposición</dt>
        <dd>{lectura.dias_exposicion} días</dd>
        <dt>Trampa</dt>
        <dd>
          {ESTADOS_TRAMPA_LECTURA[lectura.estado_trampa]}
          {lectura.cambio_atrayente && ' · atrayente cambiado'}
        </dd>
        {lectura.distancia_m !== null && (
          <>
            <dt>Distancia</dt>
            <dd>{Math.round(lectura.distancia_m)} m</dd>
          </>
        )}
      </dl>
      {lectura.observaciones && <p className="formulario__nota">«{lectura.observaciones}»</p>}
      {lectura.avisos.map((aviso) => (
        <p key={aviso} className="formulario__aviso">
          {aviso}
        </p>
      ))}
      {lectura.estado !== 'registrada' && lectura.revisada_por && (
        <p className="formulario__nota">
          {ESTADOS[lectura.estado]} por {lectura.revisada_por}
          {lectura.revisada_en && ` · ${fechaHora(lectura.revisada_en)}`}
          {lectura.motivo_rechazo && `: ${lectura.motivo_rechazo}`}
        </p>
      )}
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      {editable &&
        (rechazando ? (
          <form
            className="formulario"
            onSubmit={(e) => {
              e.preventDefault()
              revisar({ estado: 'rechazada', motivo })
            }}
          >
            <label htmlFor={`motivo-${lectura.id}`}>Motivo del rechazo</label>
            <input
              id={`motivo-${lectura.id}`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              minLength={5}
              maxLength={300}
              placeholder="Ej. tomada lejos de la trampa (sin nombres de personas)"
              required
            />
            <div className="grupo-botones">
              <button
                type="button"
                className="boton-secundario"
                onClick={() => setRechazando(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="boton-peligro"
                disabled={enviando || motivo.trim().length < 5}
              >
                Rechazar
              </button>
            </div>
          </form>
        ) : (
          <div className="grupo-botones">
            {lectura.estado !== 'validada' && (
              <button
                type="button"
                className="boton-primario"
                disabled={enviando}
                onClick={() => revisar({ estado: 'validada' })}
              >
                Validar
              </button>
            )}
            {lectura.estado !== 'rechazada' && (
              <button
                type="button"
                className="boton-secundario"
                disabled={enviando}
                onClick={() => setRechazando(true)}
              >
                Rechazar…
              </button>
            )}
          </div>
        ))}
    </li>
  )
}
