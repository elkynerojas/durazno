import { useState } from 'react'
import { Link } from 'react-router'

import { programarVisitaAdicional } from '../../api/client'
import { otraSemana, rangoSemana, semanaIso, semanasDelAnio } from '../../utils/fechas'

// «Programar visita adicional» (HU-23): responder a una lectura con capturas con otra visita de
// monitoreo al lote, por defecto la semana siguiente y con el mismo técnico.
// `personal`: responsables posibles (técnicos y agrónomos activos del predio).
export default function VisitaAdicional({ lectura, personal }) {
  // El id se genera una sola vez: reenviar no duplica la visita.
  const [id] = useState(() => globalThis.crypto?.randomUUID?.())
  const siguiente = otraSemana(semanaIso(new Date(lectura.observado_en)), 1)
  const [abierto, setAbierto] = useState(false)
  const [semana, setSemana] = useState(String(siguiente.numero))
  // Por defecto, quien registró la lectura (si puede ser responsable).
  const [responsable, setResponsable] = useState(
    personal.some((p) => p.id === lectura.responsable_id)
      ? lectura.responsable_id
      : (personal[0]?.id ?? ''),
  )
  const [creada, setCreada] = useState(null)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const numero = Number(semana)
  const valida = Number.isInteger(numero) && numero >= 1 && numero <= semanasDelAnio(siguiente.anio)

  async function programar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      setCreada(
        await programarVisitaAdicional({
          ...(id && { id }),
          lectura_id: lectura.id,
          anio: siguiente.anio,
          semana: numero,
          responsable_id: responsable,
        }),
      )
    } catch (e) {
      setError(typeof e.detalle === 'string' ? e.detalle : 'No se pudo programar la visita.')
    } finally {
      setEnviando(false)
    }
  }

  if (creada) {
    return (
      <p className="formulario__exito" role="status">
        Visita adicional programada en la semana {creada.semana}.{' '}
        <Link to="/plan">Ver en el plan</Link>
      </p>
    )
  }
  if (!abierto) {
    return (
      <button type="button" className="boton-secundario" onClick={() => setAbierto(true)}>
        Programar visita adicional
      </button>
    )
  }
  return (
    <form className="formulario" onSubmit={programar} aria-label="Visita adicional">
      <label htmlFor={`semana-adicional-${lectura.id}`}>
        Semana de la visita adicional ({siguiente.anio})
      </label>
      <input
        id={`semana-adicional-${lectura.id}`}
        type="number"
        inputMode="numeric"
        min="1"
        max={semanasDelAnio(siguiente.anio)}
        value={semana}
        onChange={(e) => setSemana(e.target.value)}
        required
      />
      {valida && (
        <p className="formulario__nota">
          {rangoSemana(otraSemana({ anio: siguiente.anio, numero }, 0))}
        </p>
      )}
      <label htmlFor={`responsable-adicional-${lectura.id}`}>Responsable</label>
      <select
        id={`responsable-adicional-${lectura.id}`}
        value={responsable}
        onChange={(e) => setResponsable(e.target.value)}
        required
      >
        {personal.length === 0 && <option value="">Sin personal asignado al predio</option>}
        {personal.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre_completo}
          </option>
        ))}
      </select>
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      <div className="grupo-botones">
        <button type="button" className="boton-secundario" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
        <button
          type="submit"
          className="boton-primario"
          disabled={enviando || !valida || !responsable}
        >
          Programar
        </button>
      </div>
    </form>
  )
}
