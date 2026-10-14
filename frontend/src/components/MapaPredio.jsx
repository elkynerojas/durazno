import { LayersControl, MapContainer, ScaleControl, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import { CAPAS_BASE, CENTRO_CACOTA, ZOOM_INICIAL } from '../config'

// Mapa base del predio. Aquí se agregarán las capas de lotes (polígonos),
// trampas (puntos) y rutas, y las herramientas de dibujo de Leaflet-Geoman.
export default function MapaPredio() {
  return (
    <MapContainer center={CENTRO_CACOTA} zoom={ZOOM_INICIAL} className="mapa">
      <LayersControl position="topright">
        {Object.entries(CAPAS_BASE).map(([clave, capa], i) => (
          <LayersControl.BaseLayer key={clave} name={capa.nombre} checked={i === 0}>
            <TileLayer url={capa.url} attribution={capa.atribucion} maxZoom={capa.maxZoom} />
          </LayersControl.BaseLayer>
        ))}
      </LayersControl>
      <ScaleControl imperial={false} />
    </MapContainer>
  )
}
