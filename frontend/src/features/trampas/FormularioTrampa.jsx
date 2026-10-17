import { useState } from 'react'

import { actualizarTrampa, crearTrampa } from '../../api/client'
import { latLngAPunto, puntoALeaflet, puntoEnPoligono } from '../../utils/geo'
import { UMBRAL_PRECISION_M, obtenerUbicacion } from '../../utils/ubicacion'
import { ESTADOS_TRAMPA, TIPOS_TRAMPA, hoyEnBogota } from './catalogo'

function mensajeDeError(error) {
  if (typeof error.detalle === 'string') return error.detalle
  if (error.estado === 422) return 'Revise los datos de la trampa.'
  return 'No se pudo guardar. Intente de nuevo.'
}

const aNumero = (texto) => (texto.trim() === '' ? NaN : Number(texto))

// Identificación y ubicación de una trampa. El lote y las coordenadas (textos de latitud y
// longitud) los controla la vista, porque también cambian al tocar el mapa.
export default function FormularioTrampa({
  trampa,
  lotes,
  loteId,
  alCambiarLote,
  coordenadas,
  alCambiarCoordenadas,
  editable,
  capturando,
  alCapturar,
  alGuardar,
}) {
  const nueva = !trampa
  // El id se genera una sola vez: si el envío se repite, la API no duplica la trampa.
  const [id] = useState(() => globalThis.crypto?.randomUUID?.())
  const [datos, setDatos] = useState({
    codigo_ica: trampa?.codigo_ica ?? '',
    tipo: trampa?.tipo ?? 'jackson',
    atrayente: trampa?.atrayente ?? TIPOS_TRAMPA.jackson.atrayente,
    fecha_instalacion: trampa?.fecha_instalacion ?? hoyEnBogota(),
    estado: trampa?.estado ?? 'activa',
  })
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  // Última lectura del GPS ({ lat, lng, precision }) y medición en curso (precisión parcial).
  const [gps, setGps] = useState(null)
  const [midiendo, setMidiendo] = useState(null)
  const [errorGps, setErrorGps] = useState(null)

  const lat = aNumero(coordenadas.lat)
  const lng = aNumero(coordenadas.lng)
  const hayPunto = Number.isFinite(lat) && Number.isFinite(lng)
  const lote = lotes.find((l) => l.id === loteId)
  const dentro = hayPunto && lote && puntoEnPoligono([lat, lng], lote.geom)
  const [latOriginal, lngOriginal] = trampa ? puntoALeaflet(trampa.geom) : []
  const movida = !nueva && (lat !== latOriginal || lng !== lngOriginal)
  // La precisión solo vale mientras el punto sea el que dio el GPS (no si se tocó el mapa).
  const gpsVigente = gps !== null && gps.lat === lat && gps.lng === lng
  const precisionM = gpsVigente ? Math.round(gps.precision * 100) / 100 : null

  async function usarUbicacion() {
    setErrorGps(null)
    setMidiendo(Infinity)
    const aplicar = (lectura) => {
      setGps(lectura)
      setMidiendo(lectura.precision)
      alCambiarCoordenadas({ lat: String(lectura.lat), lng: String(lectura.lng) })
    }
    try {
      aplicar(await obtenerUbicacion({ alAvanzar: aplicar }))
    } catch (e) {
      setErrorGps(e.message)
    } finally {
      setMidiendo(null)
    }
  }

  const cambiar = (campo) => (evento) => {
    const valor = evento.target.value
    setDatos((previos) => ({
      ...previos,
      [campo]: valor,
      // Al cambiar el tipo se propone su atrayente habitual si no se había escrito otro.
      ...(campo === 'tipo' &&
        Object.values(TIPOS_TRAMPA).some((t) => t.atrayente === previos.atrayente) && {
          atrayente: TIPOS_TRAMPA[valor].atrayente,
        }),
    }))
  }

  async function guardar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    const { estado, ...comunes } = datos
    try {
      const guardada = nueva
        ? await crearTrampa({
            ...(id && { id }),
            lote_id: loteId,
            ...comunes,
            geom: latLngAPunto(lat, lng),
            ...(precisionM !== null && { precision_m: precisionM }),
          })
        : await actualizarTrampa(trampa.id, {
            lote_id: loteId,
            ...comunes,
            estado,
            // Ubicada a mano, la precisión del GPS anterior ya no aplica.
            ...(movida && { geom: latLngAPunto(lat, lng), precision_m: precisionM }),
          })
      alGuardar(guardada)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={guardar} aria-label="Datos de la trampa">
      <fieldset disabled={!editable || enviando}>
        <h2 className="formulario__seccion">1 · Identificación</h2>
        <div className="formulario__fila">
          <div>
            <label htmlFor="codigo_ica">Código ICA (oficial)</label>
            <input
              id="codigo_ica"
              className="mono"
              value={datos.codigo_ica}
              onChange={cambiar('codigo_ica')}
              maxLength={30}
              placeholder="ICA-0001"
              required
            />
          </div>
          <div>
            <label htmlFor="lote_trampa">Lote</label>
            <select
              id="lote_trampa"
              value={loteId ?? ''}
              onChange={(e) => alCambiarLote(e.target.value)}
              required
            >
              <option value="" disabled>
                Seleccione
              </option>
              {lotes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo}
                  {l.nombre ? ` · ${l.nombre}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="etiqueta" id="tipo_trampa">
          Tipo de trampa y atrayente
        </p>
        <div role="radiogroup" aria-labelledby="tipo_trampa">
          {Object.entries(TIPOS_TRAMPA).map(([valor, t]) => (
            <label key={valor} className="opcion">
              <input
                type="radio"
                name="tipo"
                value={valor}
                checked={datos.tipo === valor}
                onChange={cambiar('tipo')}
              />
              <span>
                <strong>
                  {t.nombre} + {t.atrayente.toLowerCase()}
                </strong>
                {t.vigilancia} <em>{t.especie}</em>
              </span>
            </label>
          ))}
        </div>

        <label htmlFor="atrayente">Atrayente</label>
        <input
          id="atrayente"
          value={datos.atrayente}
          onChange={cambiar('atrayente')}
          maxLength={60}
          required
        />

        <h2 className="formulario__seccion">2 · Ubicación</h2>
        {editable && (
          <button
            type="button"
            className="boton-secundario boton-gps"
            onClick={usarUbicacion}
            disabled={midiendo !== null}
          >
            {midiendo === null
              ? 'Usar mi ubicación'
              : midiendo === Infinity
                ? 'Buscando señal GPS…'
                : `Midiendo… ±${Math.round(midiendo)} m`}
          </button>
        )}
        {errorGps && (
          <p className="formulario__error" role="alert">
            {errorGps}
          </p>
        )}
        <div className="formulario__fila">
          <div>
            <label htmlFor="latitud">Latitud</label>
            <input
              id="latitud"
              className="mono"
              type="number"
              inputMode="decimal"
              step="any"
              min="-90"
              max="90"
              value={coordenadas.lat}
              onChange={(e) => alCambiarCoordenadas({ ...coordenadas, lat: e.target.value })}
              required
            />
          </div>
          <div>
            <label htmlFor="longitud">Longitud</label>
            <input
              id="longitud"
              className="mono"
              type="number"
              inputMode="decimal"
              step="any"
              min="-180"
              max="180"
              value={coordenadas.lng}
              onChange={(e) => alCambiarCoordenadas({ ...coordenadas, lng: e.target.value })}
              required
            />
          </div>
        </div>
        {hayPunto && lote && (
          <p className={dentro ? 'formulario__exito' : 'formulario__aviso'} role="status">
            {dentro
              ? `El punto está dentro del polígono de ${lote.codigo}.`
              : `El punto no cae dentro de ${lote.codigo}: el servidor lo rechazará.`}
          </p>
        )}
        {gpsVigente &&
          (gps.precision <= UMBRAL_PRECISION_M ? (
            <p className="formulario__exito" role="status">
              Ubicación del GPS con precisión de ±{Math.round(gps.precision)} m.
            </p>
          ) : (
            <p className="formulario__aviso" role="alert">
              La precisión del GPS (±{Math.round(gps.precision)} m) supera los {UMBRAL_PRECISION_M}{' '}
              m recomendados. Espere unos segundos a cielo abierto y vuelva a medir, o ubique la
              trampa en el mapa.
            </p>
          ))}
        {trampa?.precision_m != null && !movida && (
          <p className="formulario__nota">Precisión del GPS: ±{trampa.precision_m} m</p>
        )}

        <label htmlFor="fecha_instalacion">Fecha de instalación</label>
        <input
          id="fecha_instalacion"
          type="date"
          value={datos.fecha_instalacion}
          onChange={cambiar('fecha_instalacion')}
          required
        />

        {!nueva && (
          <>
            <label htmlFor="estado_trampa">Estado</label>
            <select id="estado_trampa" value={datos.estado} onChange={cambiar('estado')}>
              {Object.entries(ESTADOS_TRAMPA).map(([valor, nombre]) => (
                <option key={valor} value={valor}>
                  {nombre}
                </option>
              ))}
            </select>
          </>
        )}
      </fieldset>

      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}

      {editable && (
        <div className="formulario__acciones formulario__acciones--inicio">
          <button type="submit" className="boton-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : nueva ? 'Guardar y generar QR' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            className="boton-secundario"
            aria-pressed={capturando}
            onClick={alCapturar}
          >
            Ubicar en el mapa
          </button>
        </div>
      )}
    </form>
  )
}
