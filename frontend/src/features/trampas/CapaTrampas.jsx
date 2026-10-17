import L from 'leaflet'
import { Marker, Tooltip, useMapEvents } from 'react-leaflet'

import { puntoALeaflet } from '../../utils/geo'

// Íconos propios (los de Leaflet por defecto no cargan con Vite): círculo Jackson, cuadrado
// McPhail, borde según el estado.
const iconos = new Map()
function icono(tipo, estado, seleccionada) {
  const clave = `${tipo}-${estado}-${seleccionada}`
  if (!iconos.has(clave)) {
    const clases = [
      'marcador-trampa',
      `marcador-trampa--${tipo}`,
      `marcador-trampa--${estado}`,
      seleccionada && 'marcador-trampa--seleccionada',
    ]
    iconos.set(
      clave,
      L.divIcon({
        className: '',
        html: `<span class="${clases.filter(Boolean).join(' ')}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    )
  }
  return iconos.get(clave)
}

const ICONO_NUEVA = L.divIcon({
  className: '',
  html: '<span class="marcador-trampa marcador-trampa--nueva"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

// Marcadores de las trampas y, si se está ubicando una, el punto propuesto.
export default function CapaTrampas({ trampas, seleccionadaId, ubicacion, alSeleccionar }) {
  return (
    <>
      {trampas.map((trampa) => (
        <Marker
          key={trampa.id}
          position={puntoALeaflet(trampa.geom)}
          icon={icono(trampa.tipo, trampa.estado, trampa.id === seleccionadaId)}
          eventHandlers={alSeleccionar && { click: () => alSeleccionar(trampa) }}
          opacity={ubicacion && trampa.id === seleccionadaId ? 0.35 : 1}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            {trampa.codigo_ica}
          </Tooltip>
        </Marker>
      ))}
      {ubicacion && <Marker position={ubicacion} icon={ICONO_NUEVA} interactive={false} />}
    </>
  )
}

// Entrega las coordenadas [lat, lng] de cada toque en el mapa mientras está activo.
export function CapturaClic({ alTocar }) {
  useMapEvents({ click: (evento) => alTocar([evento.latlng.lat, evento.latlng.lng]) })
  return null
}
