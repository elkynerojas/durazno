import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import Encabezado from '../../components/Encabezado'
import MapaPredio from '../../components/MapaPredio'
import Plantilla from '../../components/Plantilla'
import { geojsonALeaflet, puntoALeaflet, puntoEnPoligono } from '../../utils/geo'
import { useSesion } from '../auth/useSesion'
import CapaLotes from '../lotes/CapaLotes'
import { useDatosPredio } from '../mapa/useDatosPredio'
import BotonEtiquetas from './BotonEtiquetas'
import CapaTrampas, { CapturaClic } from './CapaTrampas'
import EtiquetaQr from './EtiquetaQr'
import ReponerEtiqueta from './ReponerEtiqueta'
import FormularioTrampa from './FormularioTrampa'
import TablaTrampas from './TablaTrampas'

const SIN_COORDENADAS = { lat: '', lng: '' }

export default function VistaTrampas() {
  const { usuario } = useSesion()
  const editable = usuario.rol === 'agronomo'
  const datos = useDatosPredio()
  const [parametros, setParametros] = useSearchParams()
  const [mapa, setMapa] = useState(null)
  const [trampaId, setTrampaId] = useState(parametros.get('trampa'))
  const [loteElegido, setLoteElegido] = useState(parametros.get('lote'))
  const [coordenadas, setCoordenadas] = useState(SIN_COORDENADAS)
  const [capturando, setCapturando] = useState(editable && !parametros.get('trampa'))
  // Sube al empezar una trampa nueva para vaciar el formulario.
  const [reinicio, setReinicio] = useState(0)
  const refCapas = useRef(new Map())
  const refMapa = useRef(null)

  const trampa = datos.trampas.find((t) => t.id === trampaId) ?? null
  const loteId = loteElegido ?? trampa?.lote_id ?? null
  const lote = datos.lotes.find((l) => l.id === loteId) ?? null
  const trampasDelLote = lote ? datos.trampas.filter((t) => t.lote_id === lote.id) : datos.trampas

  // Al abrir una trampa (por URL o desde la tabla) se cargan sus coordenadas.
  const cargada = useRef(null)
  useEffect(() => {
    if (!trampa || cargada.current === trampa.id) return
    cargada.current = trampa.id
    const [lat, lng] = puntoALeaflet(trampa.geom)
    setCoordenadas({ lat: String(lat), lng: String(lng) })
  }, [trampa])

  // El mapa encuadra el lote elegido.
  const geomLote = lote?.geom
  const encuadrado = useRef(null)
  useEffect(() => {
    if (!mapa || !geomLote || encuadrado.current === loteId) return
    encuadrado.current = loteId
    // La rejilla puede cambiar el tamaño del mapa después de montarlo.
    mapa.invalidateSize()
    mapa.fitBounds(geojsonALeaflet(geomLote)[0], { maxZoom: 18, padding: [30, 30] })
  }, [mapa, loteId, geomLote])

  // Un punto tocado o escrito dentro de otro lote cambia la sugerencia de lote.
  function cambiarCoordenadas(nuevas) {
    setCoordenadas(nuevas)
    const punto = [Number(nuevas.lat), Number(nuevas.lng)]
    if (nuevas.lat === '' || nuevas.lng === '' || punto.some((n) => !Number.isFinite(n))) return
    const contenedor = datos.lotes.find((l) => puntoEnPoligono(punto, l.geom))
    if (contenedor) setLoteElegido(contenedor.id)
  }

  function abrirTrampa(otra) {
    setTrampaId(otra.id)
    setLoteElegido(otra.lote_id)
    setCapturando(false)
    setParametros({ trampa: otra.id }, { replace: true })
  }

  function nuevaTrampa() {
    cargada.current = null
    setTrampaId(null)
    setCoordenadas(SIN_COORDENADAS)
    setCapturando(true)
    setReinicio((r) => r + 1)
    setParametros(loteId ? { lote: loteId } : {}, { replace: true })
  }

  function alGuardar(guardada) {
    datos.guardarTrampa(guardada)
    cargada.current = null
    abrirTrampa(guardada)
  }

  const [lat, lng] = [Number(coordenadas.lat), Number(coordenadas.lng)]
  const ubicacion =
    coordenadas.lat !== '' && coordenadas.lng !== '' && isFinite(lat) && isFinite(lng)
      ? [lat, lng]
      : null
  const titulo = trampa ? `Trampa ${trampa.codigo_ica}` : editable ? 'Registrar trampa' : 'Trampas'
  const migas = [
    { texto: 'Predio Icota', a: '/mapa' },
    ...(lote ? [{ texto: `Lote ${lote.codigo}`, a: `/lotes?lote=${lote.id}` }] : []),
    { texto: 'Trampas' },
  ]

  return (
    <Plantilla>
      <Encabezado migas={migas} titulo={titulo}>
        {lote && <BotonEtiquetas lote={lote} />}
        {editable && trampa && (
          <button type="button" className="boton-secundario" onClick={nuevaTrampa}>
            Nueva trampa
          </button>
        )}
      </Encabezado>
      {datos.error && (
        <p className="formulario__error" role="alert">
          {datos.error}
        </p>
      )}
      {editable && !datos.cargando && datos.lotes.length === 0 && (
        <p className="formulario__aviso">
          Primero registre un lote: cada trampa debe quedar dentro del polígono de su lote.
        </p>
      )}

      <div className="rejilla rejilla--tres">
        <section className="tarjeta">
          {!datos.cargando && (
            <FormularioTrampa
              key={trampa?.id ?? `nueva-${reinicio}`}
              trampa={trampa}
              lotes={datos.lotes}
              loteId={loteId}
              alCambiarLote={setLoteElegido}
              coordenadas={coordenadas}
              alCambiarCoordenadas={cambiarCoordenadas}
              editable={editable}
              capturando={capturando}
              alCapturar={() => {
                // En el teléfono el mapa queda debajo del formulario: se lleva a la vista.
                setCapturando(true)
                refMapa.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
              }}
              alGuardar={alGuardar}
            />
          )}
        </section>

        <section ref={refMapa} className="tarjeta tarjeta--sin-relleno" aria-label="Mapa del lote">
          <div className="mapa-tarjeta__barra">
            <strong>
              {lote ? `Lote ${lote.codigo}` : 'Predio'}
              {capturando ? ' · toque para ubicar' : ''}
            </strong>
          </div>
          <div className="mapa-tarjeta__lienzo mapa-tarjeta__lienzo--bajo">
            <MapaPredio ref={setMapa}>
              <CapaLotes
                lotes={datos.lotes}
                lotesIniciales={loteId ? null : datos.lotesIniciales}
                seleccionadoId={loteId}
                alSeleccionar={(l) => !capturando && setLoteElegido(l.id)}
                refCapas={refCapas}
              />
              <CapaTrampas
                trampas={trampasDelLote}
                seleccionadaId={trampa?.id}
                ubicacion={ubicacion}
                alSeleccionar={capturando ? undefined : abrirTrampa}
              />
              {capturando && (
                <CapturaClic
                  alTocar={([la, ln]) =>
                    cambiarCoordenadas({ lat: la.toFixed(6), lng: ln.toFixed(6) })
                  }
                />
              )}
            </MapaPredio>
          </div>
        </section>

        <section className="tarjeta">
          <EtiquetaQr
            key={trampa ? `${trampa.id}-${trampa.codigo_qr}` : 'nueva'}
            trampa={trampa}
            lote={lote}
          />
          {trampa && (
            <ReponerEtiqueta
              key={trampa.id}
              trampa={trampa}
              puedeReemplazar={usuario.rol !== 'productor'}
              alReemplazar={datos.guardarTrampa}
            />
          )}
        </section>
      </div>

      <TablaTrampas
        titulo={lote ? `Trampas del lote ${lote.codigo}` : 'Trampas del predio'}
        trampas={trampasDelLote}
        seleccionadaId={trampa?.id}
        alSeleccionar={abrirTrampa}
        editable={editable}
      />
    </Plantilla>
  )
}
