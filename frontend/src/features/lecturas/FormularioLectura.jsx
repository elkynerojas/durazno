import { useEffect, useState } from 'react'

import { prepararLectura, registrarLectura } from '../../api/client'
import { ahoraLocalBogota, fechaCorta, localBogotaAIso } from '../../utils/fechas'
import { distanciaAproximadaM, latLngAPunto } from '../../utils/geo'
import { obtenerUbicacion } from '../../utils/ubicacion'
import { CAPTURAS, ESTADOS_TRAMPA_LECTURA } from './catalogo'
import { moscasObjetivo, mtdTrampa } from './mtd'

const formatoMtd = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

function mensajeDeError(error) {
  if (typeof error.detalle === 'string') return error.detalle
  if (error.estado === 422) return 'Revise los datos de la lectura.'
  return 'No se pudo registrar la lectura. Intente de nuevo.'
}

// Formulario de la trampa en campo (HU-25). Los días de exposición los calcula el servidor desde
// la revisión anterior; cambiarlos exige una justificación. Toma la ubicación del teléfono al
// abrir (si hay permiso) para guardar la precisión y la distancia a la trampa.
export default function FormularioLectura({ trampa, alGuardar }) {
  // El id se genera una sola vez: si el envío se repite, la API no duplica la lectura.
  const [id] = useState(() => globalThis.crypto?.randomUUID?.())
  const [observado, setObservado] = useState(() => ahoraLocalBogota())
  const [preparacion, setPreparacion] = useState(null)
  const [dias, setDias] = useState('')
  const [justificacion, setJustificacion] = useState('')
  const [capturas, setCapturas] = useState({
    capitata_machos: 0,
    capitata_hembras: 0,
    anastrepha: 0,
  })
  const [estadoTrampa, setEstadoTrampa] = useState('buena')
  const [cambioAtrayente, setCambioAtrayente] = useState(false)
  const [observaciones, setObservaciones] = useState('')
  const [gps, setGps] = useState(null)
  const [errorGps, setErrorGps] = useState(null)
  const [buscandoGps, setBuscandoGps] = useState(true)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  // Días calculados para la fecha elegida; se proponen mientras el técnico no los cambie.
  useEffect(() => {
    if (!observado) return
    let vigente = true
    prepararLectura(trampa.id, localBogotaAIso(observado))
      .then((datos) => {
        if (!vigente) return
        setPreparacion(datos)
        setDias((actual) => (actual === '' ? String(datos.dias_exposicion) : actual))
      })
      .catch(() => vigente && setPreparacion(null))
    return () => {
      vigente = false
    }
  }, [trampa.id, observado])

  // La ubicación se pide al abrir el formulario y en cada «Reintentar» (sube el intento). Si no
  // hay permiso o señal, la lectura se guarda igual, sin posición.
  const [intentoGps, setIntentoGps] = useState(0)
  useEffect(() => {
    let vigente = true
    obtenerUbicacion({ alAvanzar: (lectura) => vigente && setGps(lectura) })
      .then((lectura) => vigente && setGps(lectura))
      .catch((e) => vigente && setErrorGps(e.message))
      .finally(() => vigente && setBuscandoGps(false))
    return () => {
      vigente = false
    }
  }, [intentoGps])

  const calculados = preparacion?.dias_exposicion
  const diasNumero = Number(dias)
  const diasValidos = dias !== '' && Number.isInteger(diasNumero) && diasNumero >= 0
  const cambiados = diasValidos && calculados !== undefined && diasNumero !== calculados
  const moscas = moscasObjetivo(trampa.tipo, capturas)
  const mtd = diasValidos ? mtdTrampa(moscas, diasNumero) : null
  const distancia = gps
    ? Math.round(distanciaAproximadaM(latLngAPunto(gps.lat, gps.lng), trampa.geom))
    : null

  const cambiarCaptura = (campo, valor) =>
    setCapturas((previas) => ({ ...previas, [campo]: Math.max(0, Math.min(10_000, valor)) }))

  async function guardar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const lectura = await registrarLectura({
        ...(id && { id }),
        trampa_id: trampa.id,
        observado_en: localBogotaAIso(observado),
        ...capturas,
        dias_exposicion: diasNumero,
        ...(cambiados && { justificacion_dias: justificacion }),
        estado_trampa: estadoTrampa,
        cambio_atrayente: cambioAtrayente,
        ...(observaciones.trim() && { observaciones }),
        ...(gps && {
          posicion: latLngAPunto(gps.lat, gps.lng),
          precision_m: Math.round(gps.precision * 100) / 100,
        }),
      })
      alGuardar(lectura)
    } catch (e) {
      setError(mensajeDeError(e))
      setEnviando(false)
    }
  }

  return (
    <form
      className="formulario formulario-lectura"
      onSubmit={guardar}
      aria-label="Lectura de trampa"
    >
      <fieldset disabled={enviando}>
        <div className="formulario__fila">
          <div>
            <label htmlFor="observado_en">Fecha y hora</label>
            <input
              id="observado_en"
              type="datetime-local"
              value={observado}
              max={ahoraLocalBogota()}
              onChange={(e) => setObservado(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="dias_exposicion">Días de exposición</label>
            <input
              id="dias_exposicion"
              type="number"
              inputMode="numeric"
              min="0"
              max="365"
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              required
            />
          </div>
        </div>
        {preparacion && (
          <p className="formulario__nota">
            {preparacion.ultima_lectura ? 'Última revisión' : 'Instalada el'}:{' '}
            {fechaCorta(preparacion.revision_anterior)} · los días se calculan desde esa fecha (
            {calculados}).
          </p>
        )}
        {cambiados && (
          <>
            <label htmlFor="justificacion_dias">¿Por qué cambia los días?</label>
            <input
              id="justificacion_dias"
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              maxLength={300}
              placeholder="Ej. la trampa se revisó sin registrar lectura"
              required
            />
          </>
        )}

        <h2 className="formulario__seccion">Especímenes capturados</h2>
        {CAPTURAS.map(({ campo, especie, detalle, ayuda }) => (
          <div key={campo} className="contador">
            <div>
              <p className="contador__nombre">
                <em>{especie}</em> · {detalle}
              </p>
              <p className="contador__ayuda">{ayuda}</p>
            </div>
            <div className="contador__control">
              <button
                type="button"
                className="boton-secundario"
                aria-label={`Restar ${especie} ${detalle}`}
                onClick={() => cambiarCaptura(campo, capturas[campo] - 1)}
              >
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="10000"
                aria-label={`${especie} ${detalle}`}
                value={capturas[campo]}
                onChange={(e) => cambiarCaptura(campo, Number(e.target.value) || 0)}
              />
              <button
                type="button"
                className="boton-secundario"
                aria-label={`Sumar ${especie} ${detalle}`}
                onClick={() => cambiarCaptura(campo, capturas[campo] + 1)}
              >
                +
              </button>
            </div>
          </div>
        ))}
        <p className="formulario__nota" aria-live="polite">
          MTD de esta trampa:{' '}
          <strong>
            {mtd === null
              ? 'sin dato'
              : `${moscas} ÷ (1 × ${diasNumero}) = ${formatoMtd.format(mtd)}`}
          </strong>
        </p>

        <p className="etiqueta" id="estado_trampa_lectura">
          Estado de la trampa
        </p>
        <div className="opciones-fila" role="radiogroup" aria-labelledby="estado_trampa_lectura">
          {Object.entries(ESTADOS_TRAMPA_LECTURA).map(([valor, nombre]) => (
            <label key={valor} className="opcion">
              <input
                type="radio"
                name="estado_trampa"
                value={valor}
                checked={estadoTrampa === valor}
                onChange={() => setEstadoTrampa(valor)}
              />
              <span>{nombre}</span>
            </label>
          ))}
        </div>

        <p className="etiqueta" id="cambio_atrayente">
          ¿Se cambió el atrayente?
        </p>
        <div className="opciones-fila" role="radiogroup" aria-labelledby="cambio_atrayente">
          {[
            [true, 'Sí'],
            [false, 'No'],
          ].map(([valor, nombre]) => (
            <label key={nombre} className="opcion">
              <input
                type="radio"
                name="cambio_atrayente"
                checked={cambioAtrayente === valor}
                onChange={() => setCambioAtrayente(valor)}
              />
              <span>{nombre}</span>
            </label>
          ))}
        </div>

        <label htmlFor="observaciones">Observaciones</label>
        <textarea
          id="observaciones"
          rows={3}
          maxLength={500}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Ej. frutos con picadura en el borde norte del lote"
        />

        <div className="formulario-lectura__gps" aria-live="polite">
          {gps ? (
            <p className="formulario__nota">
              Su ubicación: ±{Math.round(gps.precision)} m · a ≈ {distancia} m de la trampa.
            </p>
          ) : (
            <p className="formulario__nota">
              {buscandoGps
                ? 'Buscando su ubicación…'
                : `Sin ubicación${errorGps ? `: ${errorGps}` : ''}. La lectura se guarda igual.`}
            </p>
          )}
          {!buscandoGps && (
            <button
              type="button"
              className="enlace"
              onClick={() => {
                setErrorGps(null)
                setBuscandoGps(true)
                setIntentoGps((i) => i + 1)
              }}
            >
              {gps ? 'Volver a medir' : 'Reintentar'}
            </button>
          )}
        </div>
      </fieldset>

      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="boton-primario boton-bloque"
        disabled={enviando || !diasValidos || (cambiados && !justificacion.trim())}
      >
        {enviando ? 'Registrando…' : 'Registrar lectura'}
      </button>
    </form>
  )
}
