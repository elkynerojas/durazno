import { useEffect } from 'react'
import { Polygon, Tooltip, useMap } from 'react-leaflet'

import { geojsonALeaflet } from '../../utils/geo'

const ESTILO = { color: '#1e5a43', weight: 2, fillColor: '#2b6e54', fillOpacity: 0.3 }
const ESTILO_SELECCIONADO = {
  color: '#c4572e',
  weight: 3,
  dashArray: '6 4',
  fillColor: '#e8875a',
  fillOpacity: 0.25,
}

// Polígonos de los lotes. Con `editandoId`, activa la edición de vértices de ese lote y
// expone su forma actual a través de `refCapas` (id → capa de Leaflet).
export default function CapaLotes({
  lotes,
  lotesIniciales,
  seleccionadoId,
  editandoId,
  alSeleccionar,
  refCapas,
  version = 0,
}) {
  const map = useMap()

  // Encuadra el predio una sola vez, con los lotes que había al cargar: crear o editar un lote
  // después no debe mover la vista.
  useEffect(() => {
    if (!lotesIniciales?.length) return
    const limites = lotesIniciales.flatMap((lote) => geojsonALeaflet(lote.geom)[0])
    map.fitBounds(limites, { padding: [24, 24], maxZoom: 18 })
  }, [map, lotesIniciales])

  useEffect(() => {
    const capa = editandoId && refCapas.current.get(editandoId)
    if (!capa) return
    capa.pm.enable({ allowSelfIntersection: false })
    return () => capa.pm.disable()
  }, [editandoId, refCapas])

  return lotes.map((lote) => (
    <Polygon
      key={`${lote.id}-${lote.updated_at}-${version}`}
      positions={geojsonALeaflet(lote.geom)}
      pathOptions={lote.id === seleccionadoId ? ESTILO_SELECCIONADO : ESTILO}
      eventHandlers={{ click: () => alSeleccionar(lote) }}
      ref={(capa) => {
        if (capa) refCapas.current.set(lote.id, capa)
        else refCapas.current.delete(lote.id)
      }}
    >
      <Tooltip direction="center" permanent className="etiqueta-lote">
        {lote.codigo}
      </Tooltip>
    </Polygon>
  ))
}
