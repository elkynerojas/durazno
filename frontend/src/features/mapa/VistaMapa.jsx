import { useCallback, useEffect, useRef, useState } from 'react'

import { listarLotes, listarTrampas } from '../../api/client'
import BarraSuperior from '../../components/BarraSuperior'
import MapaPredio from '../../components/MapaPredio'
import { leafletAGeojson, puntoALeaflet } from '../../utils/geo'
import { useSesion } from '../auth/useSesion'
import CapaLotes from '../lotes/CapaLotes'
import ControlDibujo from '../lotes/ControlDibujo'
import PanelLote from '../lotes/PanelLote'
import CapaTrampas, { CapturaClic } from '../trampas/CapaTrampas'
import PanelTrampa from '../trampas/PanelTrampa'

const porCodigo = (a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })
const SIN_COORDENADAS = { lat: '', lng: '' }

export default function VistaMapa() {
  const { usuario } = useSesion()
  const editable = usuario.rol === 'agronomo'
  const [lotes, setLotes] = useState([])
  const [lotesIniciales, setLotesIniciales] = useState(null)
  const [trampas, setTrampas] = useState([])
  const [error, setError] = useState(null)
  // null | { geomNueva } | { lote, advertencias } | { trampa } (trampa: null si es nueva).
  const [seleccion, setSeleccion] = useState(null)
  const [editandoForma, setEditandoForma] = useState(false)
  // Sube al cancelar una edición de forma para volver a pintar los polígonos guardados.
  const [version, setVersion] = useState(0)
  // Ubicación de la trampa en edición, como textos de latitud y longitud.
  const [coordenadas, setCoordenadas] = useState(SIN_COORDENADAS)
  const [capturando, setCapturando] = useState(false)
  const refCapas = useRef(new Map())

  useEffect(() => {
    Promise.all([listarLotes(), listarTrampas()])
      .then(([listaLotes, listaTrampas]) => {
        setLotes(listaLotes.sort(porCodigo))
        setLotesIniciales(listaLotes)
        setTrampas(listaTrampas)
      })
      .catch(() => setError('No se pudieron cargar los lotes y las trampas.'))
  }, [])

  const cerrar = () => {
    if (editandoForma) setVersion((v) => v + 1)
    setSeleccion(null)
    setEditandoForma(false)
    setCapturando(false)
  }

  const alDibujar = useCallback((anillos) => {
    setEditandoForma(false)
    setCapturando(false)
    setSeleccion({ geomNueva: leafletAGeojson(anillos) })
  }, [])

  function seleccionarTrampa(trampa) {
    if (editandoForma || capturando) return
    const [lat, lng] = trampa ? puntoALeaflet(trampa.geom) : ['', '']
    setCoordenadas({ lat: String(lat), lng: String(lng) })
    setCapturando(!trampa)
    setSeleccion({ trampa })
  }

  function alGuardarLote({ advertencias, ...lote }) {
    setLotes((lista) => [...lista.filter((l) => l.id !== lote.id), lote].sort(porCodigo))
    setEditandoForma(false)
    setSeleccion({ lote, advertencias })
  }

  function alGuardarTrampa(trampa) {
    setTrampas((lista) => [...lista.filter((t) => t.id !== trampa.id), trampa])
    setCapturando(false)
    setSeleccion({ trampa })
  }

  const loteSeleccionado = seleccion?.lote
  const enTrampa = seleccion && 'trampa' in seleccion
  const trampaSeleccionada = seleccion?.trampa
  const lat = Number(coordenadas.lat)
  const lng = Number(coordenadas.lng)
  const ubicacion =
    enTrampa && coordenadas.lat !== '' && coordenadas.lng !== '' && isFinite(lat) && isFinite(lng)
      ? [lat, lng]
      : null

  return (
    <div className="app">
      <BarraSuperior />
      <main className="contenido contenido--mapa">
        {error && (
          <p className="formulario__error mapa__error" role="alert">
            {error}
          </p>
        )}
        <MapaPredio>
          <CapaLotes
            lotes={lotes}
            lotesIniciales={lotesIniciales}
            seleccionadoId={loteSeleccionado?.id}
            editandoId={editandoForma ? loteSeleccionado?.id : null}
            alSeleccionar={(lote) => {
              // Mientras se ubica una trampa, tocar un lote es tocar el mapa.
              if (editandoForma || capturando) return
              setSeleccion({ lote, advertencias: [] })
            }}
            refCapas={refCapas}
            version={version}
          />
          <CapaTrampas
            trampas={trampas}
            seleccionadaId={trampaSeleccionada?.id}
            ubicacion={ubicacion}
            alSeleccionar={seleccionarTrampa}
          />
          {capturando && (
            <CapturaClic
              alTocar={([la, ln]) => setCoordenadas({ lat: la.toFixed(6), lng: ln.toFixed(6) })}
            />
          )}
          {editable && <ControlDibujo alDibujar={alDibujar} />}
        </MapaPredio>

        {editable && !seleccion && (
          <button
            type="button"
            className="boton-primario boton-flotante"
            onClick={() => seleccionarTrampa(null)}
          >
            Nueva trampa
          </button>
        )}

        {seleccion && enTrampa && (
          <PanelTrampa
            key={trampaSeleccionada?.id ?? 'nueva'}
            trampa={trampaSeleccionada}
            lotes={lotes}
            coordenadas={coordenadas}
            alCambiarCoordenadas={setCoordenadas}
            editable={editable}
            capturando={capturando}
            alCapturar={() => setCapturando(true)}
            alGuardar={alGuardarTrampa}
            alCerrar={cerrar}
          />
        )}
        {seleccion && !enTrampa && (
          <PanelLote
            key={loteSeleccionado?.id ?? 'nuevo'}
            lote={loteSeleccionado}
            geomNueva={seleccion.geomNueva}
            advertencias={seleccion.advertencias}
            editable={editable}
            editandoForma={editandoForma}
            obtenerForma={() =>
              leafletAGeojson(refCapas.current.get(loteSeleccionado.id).getLatLngs())
            }
            alEditarForma={() => setEditandoForma(true)}
            alGuardar={alGuardarLote}
            alEliminar={(id) => {
              setLotes((lista) => lista.filter((l) => l.id !== id))
              cerrar()
            }}
            alCerrar={cerrar}
          />
        )}
      </main>
    </div>
  )
}
