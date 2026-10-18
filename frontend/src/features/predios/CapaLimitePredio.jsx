import { useEffect } from 'react'
import { Polygon, useMap } from 'react-leaflet'

import { geojsonALeaflet } from '../../utils/geo'

const ESTILO = { color: '#17322a', weight: 3, dashArray: '10 6', fill: false, interactive: false }

// Contorno del límite del predio. Con `encuadrar`, el mapa se ajusta al límite (cuando el predio
// aún no tiene lotes que encuadrar).
export default function CapaLimitePredio({ limite, encuadrar = false }) {
  const map = useMap()

  useEffect(() => {
    if (!encuadrar || !limite) return
    map.fitBounds(geojsonALeaflet(limite)[0], { padding: [24, 24], maxZoom: 17 })
  }, [map, limite, encuadrar])

  if (!limite) return null
  return <Polygon positions={geojsonALeaflet(limite)} pathOptions={ESTILO} />
}
