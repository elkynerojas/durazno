import { useState } from 'react'

import { actualizarTrampa, crearTrampa } from '../../api/client'
import { latLngAPunto, puntoALeaflet, puntoEnPoligono } from '../../utils/geo'
import { ESTADOS_TRAMPA, TIPOS_TRAMPA, hoyEnBogota } from './catalogo'
import QrTrampa from './QrTrampa'

function mensajeDeError(error) {
  if (typeof error.detalle === 'string') return error.detalle
  if (error.estado === 422) return 'Revise los datos de la trampa.'
  return 'No se pudo guardar. Intente de nuevo.'
}

const aNumero = (texto) => (texto.trim() === '' ? NaN : Number(texto))

// Panel de la trampa seleccionada o nueva. La ubicación (`coordenadas`, textos de latitud y
// longitud) la controla la vista porque también cambia al tocar el mapa.
export default function PanelTrampa({
  trampa,
  lotes,
  coordenadas,
  alCambiarCoordenadas,
  editable,
  capturando,
  alCapturar,
  alGuardar,
  alCerrar,
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
  const [loteManual, setLoteManual] = useState(null)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const lat = aNumero(coordenadas.lat)
  const lng = aNumero(coordenadas.lng)
  const hayPunto = Number.isFinite(lat) && Number.isFinite(lng)
  const loteSugerido = hayPunto && lotes.find((l) => puntoEnPoligono([lat, lng], l.geom))
  const loteId = loteManual ?? (loteSugerido ? loteSugerido.id : (trampa?.lote_id ?? ''))
  const [latOriginal, lngOriginal] = trampa ? puntoALeaflet(trampa.geom) : []
  const movida = !nueva && (lat !== latOriginal || lng !== lngOriginal)

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
          })
        : await actualizarTrampa(trampa.id, {
            lote_id: loteId,
            ...comunes,
            estado,
            // Ubicada a mano: la precisión del GPS anterior ya no aplica.
            ...(movida && { geom: latLngAPunto(lat, lng), precision_m: null }),
          })
      alGuardar(guardada)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <aside
      className="panel-lote"
      aria-label={nueva ? 'Nueva trampa' : `Trampa ${trampa.codigo_ica}`}
    >
      <form className="formulario" onSubmit={guardar}>
        <h2>{nueva ? 'Nueva trampa' : `Trampa ${trampa.codigo_ica}`}</h2>
        {!nueva && <QrTrampa trampa={trampa} />}
        {editable && capturando && (
          <p className="formulario__nota">
            Toque el mapa donde está la trampa o escriba sus coordenadas.
          </p>
        )}

        <fieldset disabled={!editable || enviando}>
          <div className="formulario__fila">
            <div>
              <label htmlFor="latitud">Latitud</label>
              <input
                id="latitud"
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

          <label htmlFor="lote_trampa">Lote</label>
          <select
            id="lote_trampa"
            value={loteId}
            onChange={(e) => setLoteManual(e.target.value)}
            required
          >
            <option value="" disabled>
              Seleccione el lote
            </option>
            {lotes.map((lote) => (
              <option key={lote.id} value={lote.id}>
                {lote.codigo}
                {lote.nombre ? ` · ${lote.nombre}` : ''}
              </option>
            ))}
          </select>

          <label htmlFor="codigo_ica">Código ICA</label>
          <input
            id="codigo_ica"
            value={datos.codigo_ica}
            onChange={cambiar('codigo_ica')}
            maxLength={30}
            required
          />

          <label htmlFor="tipo_trampa">Tipo</label>
          <select id="tipo_trampa" value={datos.tipo} onChange={cambiar('tipo')}>
            {Object.entries(TIPOS_TRAMPA).map(([valor, { nombre }]) => (
              <option key={valor} value={valor}>
                {nombre}
              </option>
            ))}
          </select>

          <label htmlFor="atrayente">Atrayente</label>
          <input
            id="atrayente"
            value={datos.atrayente}
            onChange={cambiar('atrayente')}
            maxLength={60}
            required
          />

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

        {trampa?.precision_m != null && !movida && (
          <p className="formulario__nota">Precisión del GPS: ±{trampa.precision_m} m</p>
        )}
        {error && (
          <p className="formulario__error" role="alert">
            {error}
          </p>
        )}

        <div className="formulario__acciones">
          <button type="button" className="boton-secundario" onClick={alCerrar}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </button>
          {editable && !nueva && !capturando && (
            <button type="button" className="boton-secundario" onClick={alCapturar}>
              Mover en el mapa
            </button>
          )}
          {editable && (
            <button type="submit" className="boton-primario" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>
      </form>
    </aside>
  )
}
