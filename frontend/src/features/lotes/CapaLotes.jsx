import { useEffect, useRef } from 'react'
import { Polygon, Tooltip, useMap } from 'react-leaflet'

import { geojsonALeaflet } from '../../utils/geo'

const ESTILO = { color: '#c8642b', weight: 2, fillOpacity: 0.15 }
const ESTILO_SELECCIONADO = { color: '#ffd166', weight: 3, fillOpacity: 0.3 }

// Polígonos de los lotes. Con `editandoId`, activa la edición de vértices de ese lote y
// expone su forma actual a través de `refCapas` (id → capa de Leaflet).
export default function CapaLotes({
  lotes,
  seleccionadoId,
  editandoId,
  alSeleccionar,
  refCapas,
  version = 0,
}) {
  const map = useMap()
  const ajustado = useRef(false)

  useEffect(() => {
    if (ajustado.current || lotes.length === 0) return
    ajustado.current = true
    const limites = lotes.flatMap((lote) => geojsonALeaflet(lote.geom)[0])
    map.fitBounds(limites, { padding: [24, 24], maxZoom: 18 })
  }, [map, lotes])

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
