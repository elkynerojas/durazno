import { useEffect, useState } from 'react'

import { obtenerMapa } from '../../api/client'
import { porCodigo, porCodigoIca } from './useDatosPredio'

// Separa la FeatureCollection de GET /mapa en lotes y trampas con la forma de las demás vistas
// (`geom` en GeoJSON junto a sus propiedades).
export function separarMapa(coleccion) {
  const de = (elemento) =>
    coleccion.features
      .filter((f) => f.properties.elemento === elemento)
      .map(({ geometry, properties }) => ({ ...properties, geom: geometry }))
  return {
    lotes: de('lote').sort(porCodigo),
    trampas: de('trampa').sort(porCodigoIca),
    resumen: coleccion.resumen,
    umbrales: coleccion.umbrales,
  }
}

// Mapa del predio con el estado de monitoreo; se carga una vez por predio (ver useDatosPredio).
export function useMapa(predioId) {
  const [mapa, setMapa] = useState({ lotes: [], trampas: [], resumen: null, umbrales: null })
  const [lotesIniciales, setLotesIniciales] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    obtenerMapa(predioId)
      .then((coleccion) => {
        if (!vigente) return
        const separado = separarMapa(coleccion)
        setMapa(separado)
        setLotesIniciales(separado.lotes)
      })
      .catch(() => vigente && setError('No se pudo cargar el mapa del predio.'))
    return () => {
      vigente = false
    }
  }, [predioId])

  return { ...mapa, lotesIniciales, error }
}
