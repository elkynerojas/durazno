import L from 'leaflet'
import { Marker, Tooltip } from 'react-leaflet'

import { puntoALeaflet } from '../../utils/geo'

// Rombo del color del tipo de hallazgo; el color lo valida el servidor (`#rrggbb`).
const iconos = new Map()
function icono(color, seleccionado) {
  const clave = `${color}-${seleccionado}`
  if (!iconos.has(clave)) {
    const clases = ['marcador-hallazgo', seleccionado && 'marcador-hallazgo--seleccionado']
    iconos.set(
      clave,
      L.divIcon({
        className: '',
        html: `<span class="${clases.filter(Boolean).join(' ')}" style="background:${color}"></span>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    )
  }
  return iconos.get(clave)
}

const ICONO_NUEVO = L.divIcon({
  className: '',
  html: '<span class="marcador-hallazgo marcador-hallazgo--nuevo"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

// Hallazgos del predio y, mientras se registra uno, el punto propuesto.
export default function CapaHallazgos({ hallazgos, seleccionadoId, ubicacion, alSeleccionar }) {
  return (
    <>
      {hallazgos.map((h) => (
        <Marker
          key={h.id}
          position={puntoALeaflet(h.ubicacion)}
          icon={icono(h.tipo_color, h.id === seleccionadoId)}
          eventHandlers={alSeleccionar && { click: () => alSeleccionar(h) }}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            {h.titulo}
          </Tooltip>
        </Marker>
      ))}
      {ubicacion && <Marker position={ubicacion} icon={ICONO_NUEVO} interactive={false} />}
    </>
  )
}
