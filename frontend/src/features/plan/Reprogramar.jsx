import { useState } from 'react'

import { reprogramarActividad } from '../../api/client'
import { rangoSemana, semanaDelAnio, semanasDelAnio } from '../../utils/fechas'

// «Reprogramar» (HU-23): mover la actividad a otra semana con un motivo obligatorio.
export default function Reprogramar({ actividad, alReprogramar, alCancelar }) {
  // El id del cambio se genera una vez: reenviar no mueve la actividad dos veces.
  const [id] = useState(() => globalThis.crypto?.randomUUID?.())
  const [anio, setAnio] = useState(actividad.anio)
  const [semana, setSemana] = useState(String(actividad.semana))
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const total = semanasDelAnio(anio)
  const numero = Number(semana)
  const valida = Number.isInteger(numero) && numero >= 1 && numero <= total
  const misma = anio === actividad.anio && numero === actividad.semana

  async function guardar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      alReprogramar(
        await reprogramarActividad(actividad.id, {
          ...(id && { id }),
          anio,
          semana: numero,
          motivo,
        }),
      )
    } catch (e) {
      setError(typeof e.detalle === 'string' ? e.detalle : 'No se pudo reprogramar la actividad.')
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={guardar} aria-label="Reprogramar actividad">
      <h3 className="formulario__seccion">Reprogramar</h3>
      <fieldset disabled={enviando}>
        <div className="formulario__fila">
          <div>
            <label htmlFor="anio_reprogramar">Año</label>
            <select
              id="anio_reprogramar"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
            >
              {[actividad.anio, actividad.anio + 1].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="semana_reprogramar">Nueva semana</label>
            <input
              id="semana_reprogramar"
              type="number"
              inputMode="numeric"
              min="1"
              max={total}
              value={semana}
              onChange={(e) => setSemana(e.target.value)}
              required
            />
          </div>
        </div>
        {valida && <p className="formulario__nota">{rangoSemana(semanaDelAnio(anio, numero))}</p>}
        <label htmlFor="motivo_reprogramar">Motivo</label>
        <textarea
          id="motivo_reprogramar"
          rows={2}
          minLength={5}
          maxLength={300}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej. aumento de capturas de C. capitata en el lote"
          required
        />
      </fieldset>
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      <div className="formulario__acciones">
        <button type="button" className="boton-secundario" onClick={alCancelar}>
          Cancelar
        </button>
        <button
          type="submit"
          className="boton-primario"
          disabled={enviando || !valida || misma || motivo.trim().length < 5}
        >
          {enviando ? 'Reprogramando…' : 'Reprogramar'}
        </button>
      </div>
    </form>
  )
}
