import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

// Botón de Leaflet-Geoman para dibujar un polígono. Al terminar entrega los anillos de Leaflet
// y quita el dibujo temporal: el lote se pinta desde la API cuando se guarda.
export default function ControlDibujo({ alDibujar }) {
  const map = useMap()

  useEffect(() => {
    map.pm.setLang('es')
    map.pm.addControls({
      position: 'topleft',
      drawPolygon: true,
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      editMode: false,
      dragMode: false,
      cutPolygon: false,
      removalMode: false,
      rotateMode: false,
    })
    map.pm.setGlobalOptions({ allowSelfIntersection: false })
    const alCrear = ({ layer }) => {
      const anillos = layer.getLatLngs()
      layer.remove()
      alDibujar(anillos)
    }
    map.on('pm:create', alCrear)
    return () => {
      map.off('pm:create', alCrear)
      map.pm.removeControls()
    }
  }, [map, alDibujar])

  return null
}
