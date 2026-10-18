import L from 'leaflet'
import { Marker, Polyline, Tooltip } from 'react-leaflet'

import { puntoALeaflet } from '../../utils/geo'

const ESTILO_RECORRIDO = { color: '#e8875a', weight: 4, dashArray: '8 6' }

const iconos = new Map()
function icono(texto, tipo) {
  const clave = `${texto}-${tipo}`
  if (!iconos.has(clave)) {
    iconos.set(
      clave,
      L.divIcon({
        className: '',
        html: `<span class="marcador-parada marcador-parada--${tipo}">${texto}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    )
  }
  return iconos.get(clave)
}

// Recorrido de la ruta: línea en el orden de visita y cada trampa con su número. Las trampas
// activas aún sin lugar en el orden aparecen con «?»; tocarlas las agrega (`alTocar`).
export default function CapaRuta({ orden, trampas, alTocar }) {
  const porId = new Map(trampas.map((t) => [t.id, t]))
  const posiciones = orden.map((id) => puntoALeaflet(porId.get(id).geom))
  const sinOrden = trampas.filter((t) => !orden.includes(t.id))
  return (
    <>
      {posiciones.length > 1 && <Polyline positions={posiciones} pathOptions={ESTILO_RECORRIDO} />}
      {orden.map((id, i) => {
        const trampa = porId.get(id)
        return (
          <Marker
            key={id}
            position={posiciones[i]}
            icon={icono(i + 1, trampa.tipo)}
            title={`${i + 1}. ${trampa.codigo_ica}`}
          >
            <Tooltip direction="top" offset={[0, -14]}>
              {trampa.codigo_ica}
            </Tooltip>
          </Marker>
        )
      })}
      {sinOrden.map((trampa) => (
        <Marker
          key={trampa.id}
          position={puntoALeaflet(trampa.geom)}
          icon={icono('?', `${trampa.tipo} marcador-parada--pendiente`)}
          title={`Agregar ${trampa.codigo_ica}`}
          eventHandlers={alTocar && { click: () => alTocar(trampa.id) }}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            {trampa.codigo_ica}
          </Tooltip>
        </Marker>
      ))}
    </>
  )
}
