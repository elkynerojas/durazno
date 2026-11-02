import { useEffect, useRef, useState } from 'react'

import { obtenerHallazgo, registrarHallazgo, subirEvidencia } from '../../api/client'
import { ahoraLocalBogota, localBogotaAIso } from '../../utils/fechas'
import { latLngAPunto, puntoEnPoligono } from '../../utils/geo'
import { UMBRAL_PRECISION_M, obtenerUbicacion } from '../../utils/ubicacion'
import { MAX_EVIDENCIAS, MAX_MB } from './catalogo'

const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp']

function mensajeDeError(error) {
  if (typeof error.detalle === 'string') return error.detalle
  if (error.estado === 422) return 'Revise los datos del hallazgo.'
  return 'No se pudo guardar. Revise la conexión e intente de nuevo.'
}

const aNumero = (texto) => (texto.trim() === '' ? NaN : Number(texto))

// Registro de un hallazgo (HU-41). El lote y las coordenadas los controla la vista, porque también
// cambian al tocar el mapa. Primero se guarda el hallazgo y luego cada foto; los `id` los genera
// el cliente, así que «Guardar» se puede repetir sin duplicar nada si falla la conexión.
export default function FormularioHallazgo({
  lotes,
  tipos,
  loteId,
  alCambiarLote,
  coordenadas,
  alCambiarCoordenadas,
  alCapturar,
  alGuardar,
  alCancelar,
}) {
  const [id] = useState(() => crypto.randomUUID())
  const [datos, setDatos] = useState({
    tipo_id: tipos[0]?.id ?? '',
    titulo: '',
    descripcion: '',
    observado: ahoraLocalBogota(),
  })
  // { id, archivo, vista (URL local), subida }
  const [fotos, setFotos] = useState([])
  const [avisoFotos, setAvisoFotos] = useState(null)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [gps, setGps] = useState(null)
  const [midiendo, setMidiendo] = useState(null)
  const [errorGps, setErrorGps] = useState(null)
  const refFotos = useRef(fotos)
  useEffect(() => {
    refFotos.current = fotos
  }, [fotos])

  // Libera las vistas previas al cerrar el formulario.
  useEffect(() => () => refFotos.current.forEach((f) => URL.revokeObjectURL(f.vista)), [])

  const lat = aNumero(coordenadas.lat)
  const lng = aNumero(coordenadas.lng)
  const hayPunto = Number.isFinite(lat) && Number.isFinite(lng)
  const lote = lotes.find((l) => l.id === loteId)
  const dentro = hayPunto && lote && puntoEnPoligono([lat, lng], lote.geom)
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

  const cambiar = (campo) => (evento) => setDatos((d) => ({ ...d, [campo]: evento.target.value }))

  function agregarFotos(evento) {
    const elegidas = [...evento.target.files]
    evento.target.value = ''
    const validas = elegidas.filter(
      (f) => TIPOS_FOTO.includes(f.type) && f.size <= MAX_MB * 1024 * 1024,
    )
    const cupo = MAX_EVIDENCIAS - fotos.length
    const nuevas = validas.slice(0, cupo).map((archivo) => ({
      id: crypto.randomUUID(),
      archivo,
      vista: URL.createObjectURL(archivo),
      subida: false,
    }))
    setFotos((previas) => [...previas, ...nuevas])
    const avisos = []
    if (validas.length < elegidas.length)
      avisos.push(`Solo se aceptan fotos JPEG, PNG o WebP de hasta ${MAX_MB} MB.`)
    if (validas.length > cupo) avisos.push(`Se admiten máximo ${MAX_EVIDENCIAS} fotos.`)
    setAvisoFotos(avisos.join(' ') || null)
  }

  function quitarFoto(foto) {
    URL.revokeObjectURL(foto.vista)
    setFotos((previas) => previas.filter((f) => f.id !== foto.id))
  }

  async function guardar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const hallazgo = await registrarHallazgo({
        id,
        lote_id: loteId,
        tipo_id: datos.tipo_id,
        titulo: datos.titulo,
        descripcion: datos.descripcion,
        ubicacion: latLngAPunto(lat, lng),
        ...(precisionM !== null && { precision_m: precisionM }),
        observado_en: localBogotaAIso(datos.observado),
      })
      let fallidas = 0
      let detalle = null
      for (const foto of fotos.filter((f) => !f.subida)) {
        try {
          await subirEvidencia(hallazgo.id, foto.archivo, foto.id)
          setFotos((previas) => previas.map((f) => (f.id === foto.id ? { ...f, subida: true } : f)))
        } catch (e) {
          fallidas += 1
          detalle ??= mensajeDeError(e)
        }
      }
      if (fallidas > 0) {
        setError(
          `El hallazgo quedó registrado, pero ${fallidas === 1 ? '1 foto no se subió' : `${fallidas} fotos no se subieron`} (${detalle}). Toque «Guardar hallazgo» para reintentar o quite la foto.`,
        )
        return
      }
      alGuardar(await obtenerHallazgo(hallazgo.id))
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={guardar} aria-label="Registrar hallazgo">
      <fieldset disabled={enviando}>
        <h2 className="formulario__seccion">1 · ¿Qué encontró?</h2>
        <label htmlFor="hallazgo_tipo">Tipo de hallazgo</label>
        <select id="hallazgo_tipo" value={datos.tipo_id} onChange={cambiar('tipo_id')} required>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>

        <label htmlFor="hallazgo_titulo">Título</label>
        <input
          id="hallazgo_titulo"
          value={datos.titulo}
          onChange={cambiar('titulo')}
          maxLength={120}
          placeholder="Ej. Manchas oscuras en hojas del sector norte"
          required
        />

        <label htmlFor="hallazgo_descripcion">Descripción detallada</label>
        <textarea
          id="hallazgo_descripcion"
          value={datos.descripcion}
          onChange={cambiar('descripcion')}
          maxLength={4000}
          rows={5}
          placeholder="Qué observó, cuántos árboles o frutos, en qué parte del lote…"
          required
        />

        <label htmlFor="hallazgo_observado">Fecha y hora de la observación</label>
        <input
          id="hallazgo_observado"
          type="datetime-local"
          value={datos.observado}
          max={ahoraLocalBogota()}
          onChange={cambiar('observado')}
          required
        />

        <h2 className="formulario__seccion">2 · Ubicación</h2>
        <div className="grupo-botones">
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
          <button type="button" className="boton-secundario" onClick={alCapturar}>
            Tocar en el mapa
          </button>
        </div>
        {errorGps && (
          <p className="formulario__aviso" role="alert">
            {errorGps}
          </p>
        )}
        <div className="formulario__fila">
          <div>
            <label htmlFor="hallazgo_lat">Latitud</label>
            <input
              id="hallazgo_lat"
              className="mono"
              type="number"
              step="any"
              min="-90"
              max="90"
              value={coordenadas.lat}
              onChange={(e) => alCambiarCoordenadas({ ...coordenadas, lat: e.target.value })}
              required
            />
          </div>
          <div>
            <label htmlFor="hallazgo_lng">Longitud</label>
            <input
              id="hallazgo_lng"
              className="mono"
              type="number"
              step="any"
              min="-180"
              max="180"
              value={coordenadas.lng}
              onChange={(e) => alCambiarCoordenadas({ ...coordenadas, lng: e.target.value })}
              required
            />
          </div>
        </div>
        <label htmlFor="hallazgo_lote">Lote</label>
        <select
          id="hallazgo_lote"
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
        {hayPunto && lote && (
          <p className={dentro ? 'formulario__exito' : 'formulario__aviso'} role="status">
            {dentro
              ? `El punto está dentro del lote ${lote.codigo}.`
              : `El punto no cae dentro de ${lote.codigo}: el servidor lo rechazará.`}
          </p>
        )}
        {gpsVigente && gps.precision > UMBRAL_PRECISION_M && (
          <p className="formulario__aviso">
            La precisión del GPS (±{Math.round(gps.precision)} m) supera los {UMBRAL_PRECISION_M} m
            recomendados. Puede volver a medir o tocar el punto en el mapa.
          </p>
        )}

        <h2 className="formulario__seccion">3 · Evidencias fotográficas</h2>
        <p className="formulario__nota">
          Hasta {MAX_EVIDENCIAS} fotos JPEG, PNG o WebP de máximo {MAX_MB} MB. Se guardan reducidas
          y sin la ubicación que agrega el teléfono.
        </p>
        {fotos.length > 0 && (
          <ul className="galeria-evidencias" aria-label="Fotos elegidas">
            {fotos.map((foto, i) => (
              <li key={foto.id} className="miniatura">
                <img src={foto.vista} alt={`Foto ${i + 1}`} />
                {foto.subida ? (
                  <span className="miniatura__estado">Subida</span>
                ) : (
                  <button
                    type="button"
                    className="miniatura__quitar"
                    onClick={() => quitarFoto(foto)}
                    aria-label={`Quitar foto ${i + 1}`}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {fotos.length < MAX_EVIDENCIAS && (
          <label className="boton-secundario boton-archivo">
            Agregar fotos
            <input type="file" accept={TIPOS_FOTO.join(',')} multiple onChange={agregarFotos} />
          </label>
        )}
        {avisoFotos && (
          <p className="formulario__aviso" role="alert">
            {avisoFotos}
          </p>
        )}

        {error && (
          <p className="formulario__error" role="alert">
            {error}
          </p>
        )}
        <div className="formulario__acciones">
          <button type="button" className="boton-secundario" onClick={alCancelar}>
            Cancelar
          </button>
          <button type="submit" className="boton-primario" disabled={!loteId || !hayPunto}>
            {enviando ? 'Guardando…' : 'Guardar hallazgo'}
          </button>
        </div>
      </fieldset>
    </form>
  )
}
