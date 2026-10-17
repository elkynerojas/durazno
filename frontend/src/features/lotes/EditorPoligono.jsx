import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

// Dibujo de polígonos con Leaflet-Geoman, manejado desde los botones de la página (sin la
// barra de Geoman). Al cerrar el polígono entrega sus anillos y quita el dibujo temporal: el
// lote se pinta desde la API cuando se guarda.
export default function EditorPoligono({ dibujando, alDibujar, alTerminar }) {
  const map = useMap()

  useEffect(() => {
    map.pm.setLang('es')
    map.pm.setGlobalOptions({ allowSelfIntersection: false, snappable: true })
  }, [map])

  useEffect(() => {
    if (!dibujando) return
    const alCrear = ({ layer }) => {
      const anillos = layer.getLatLngs()
      layer.remove()
      alDibujar(anillos)
    }
    map.on('pm:create', alCrear)
    map.on('pm:drawend', alTerminar)
    map.pm.enableDraw('Polygon')
    return () => {
      map.off('pm:create', alCrear)
      map.off('pm:drawend', alTerminar)
      map.pm.disableDraw()
    }
  }, [map, dibujando, alDibujar, alTerminar])

  return null
}
