import { useEffect } from 'react'
import { Polygon, Tooltip, useMap } from 'react-leaflet'

import { geojsonALeaflet } from '../../utils/geo'
import { estiloLote } from '../mapa/colores'

// Polígonos de los lotes. Con `editandoId`, activa la edición de vértices de ese lote y
// expone su forma actual a través de `refCapas` (id → capa de Leaflet). `colorSeleccionado`
// previsualiza el color que se está eligiendo para el lote seleccionado. Sin `etiquetas`, no
// muestra el código en el centro (p. ej. en las rutas, donde taparía las paradas).
export default function CapaLotes({
  lotes,
  lotesIniciales,
  seleccionadoId,
  colorSeleccionado,
  editandoId,
  alSeleccionar,
  refCapas,
  version = 0,
  etiquetas = true,
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
      pathOptions={
        lote.id === seleccionadoId
          ? estiloLote(colorSeleccionado !== undefined ? colorSeleccionado : lote.color, true)
          : estiloLote(lote.color)
      }
      eventHandlers={{ click: () => alSeleccionar(lote) }}
      ref={(capa) => {
        if (capa) refCapas.current.set(lote.id, capa)
        else refCapas.current.delete(lote.id)
      }}
    >
      {etiquetas && (
        <Tooltip direction="center" permanent className="etiqueta-lote">
          {lote.codigo}
        </Tooltip>
      )}
    </Polygon>
  ))
}
