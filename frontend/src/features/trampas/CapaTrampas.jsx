import L from 'leaflet'
import { Marker, Popup, Tooltip, useMapEvents } from 'react-leaflet'

import { puntoALeaflet } from '../../utils/geo'

// Íconos propios (los de Leaflet por defecto no cargan con Vite): círculo Jackson, cuadrado
// McPhail, borde según el estado y relleno según el monitoreo (si se conoce).
const iconos = new Map()
function icono(tipo, estado, monitoreo, seleccionada) {
  const clave = `${tipo}-${estado}-${monitoreo}-${seleccionada}`
  if (!iconos.has(clave)) {
    const clases = [
      'marcador-trampa',
      `marcador-trampa--${tipo}`,
      `marcador-trampa--${estado}`,
      monitoreo && `marcador-trampa--${monitoreo}`,
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

// Marcadores de las trampas y, si se está ubicando una, el punto propuesto. `ventana(trampa)`
// es el contenido opcional de la ventana que se abre al tocar la trampa.
export default function CapaTrampas({
  trampas,
  seleccionadaId,
  ubicacion,
  alSeleccionar,
  ventana,
}) {
  return (
    <>
      {trampas.map((trampa) => (
        <Marker
          key={trampa.id}
          position={puntoALeaflet(trampa.geom)}
          icon={icono(trampa.tipo, trampa.estado, trampa.monitoreo, trampa.id === seleccionadaId)}
          eventHandlers={alSeleccionar && { click: () => alSeleccionar(trampa) }}
          opacity={ubicacion && trampa.id === seleccionadaId ? 0.35 : 1}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            {trampa.codigo_ica}
          </Tooltip>
          {ventana && <Popup offset={[0, -6]}>{ventana(trampa)}</Popup>}
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
