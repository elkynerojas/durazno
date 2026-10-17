import { useState } from 'react'
import { LayersControl, MapContainer, ScaleControl, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import { CAPAS_BASE, CENTRO_CACOTA, ZOOM_INICIAL } from '../config'

// Mapa base del predio. Las capas (lotes, trampas, rutas) y controles llegan como hijos.
// `ref` entrega la instancia de Leaflet (para encuadrar o activar herramientas).
export default function MapaPredio({ children, ref, coordenadas = true }) {
  return (
    <MapContainer ref={ref} center={CENTRO_CACOTA} zoom={ZOOM_INICIAL} className="mapa">
      <LayersControl position="topright">
        {Object.entries(CAPAS_BASE).map(([clave, capa], i) => (
          <LayersControl.BaseLayer key={clave} name={capa.nombre} checked={i === 0}>
            <TileLayer url={capa.url} attribution={capa.atribucion} maxZoom={capa.maxZoom} />
          </LayersControl.BaseLayer>
        ))}
      </LayersControl>
      <ScaleControl imperial={false} position="bottomright" />
      {coordenadas && <CoordenadasCursor />}
      {children}
    </MapContainer>
  )
}

// Latitud y longitud bajo el puntero (WGS 84), como en el mockup de registro de lote.
function CoordenadasCursor() {
  const [posicion, setPosicion] = useState(null)
  useMapEvents({
    mousemove: (e) => setPosicion(e.latlng),
    mouseout: () => setPosicion(null),
  })
  if (!posicion) return null
  return (
    <div className="coordenadas-mapa" aria-hidden="true">
      WGS 84 · {posicion.lat.toFixed(5)}, {posicion.lng.toFixed(5)}
    </div>
  )
}
