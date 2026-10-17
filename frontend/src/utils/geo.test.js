import { describe, expect, it } from 'vitest'

import {
  geojsonALeaflet,
  latLngAPunto,
  leafletAGeojson,
  puntoALeaflet,
  puntoEnPoligono,
} from './geo'

const POLIGONO = {
  type: 'Polygon',
  coordinates: [
    [
      [-72.64, 7.27],
      [-72.63, 7.27],
      [-72.63, 7.28],
      [-72.64, 7.27],
    ],
  ],
}
const ANILLOS = [
  [
    [7.27, -72.64],
    [7.27, -72.63],
    [7.28, -72.63],
  ],
]

describe('geo', () => {
  it('pasa de GeoJSON [lng, lat] a Leaflet [lat, lng] sin el punto de cierre', () => {
    expect(geojsonALeaflet(POLIGONO)).toEqual(ANILLOS)
  })

  it('pasa de Leaflet a GeoJSON y cierra el anillo', () => {
    expect(leafletAGeojson(ANILLOS)).toEqual(POLIGONO)
  })

  it('acepta objetos LatLng como los que devuelve Leaflet', () => {
    const latLngs = ANILLOS.map((anillo) => anillo.map(([lat, lng]) => ({ lat, lng })))
    expect(leafletAGeojson(latLngs)).toEqual(POLIGONO)
  })

  it('no duplica el cierre si el anillo ya viene cerrado', () => {
    const cerrado = [[...ANILLOS[0], ANILLOS[0][0]]]
    expect(leafletAGeojson(cerrado)).toEqual(POLIGONO)
  })

  it('ida y vuelta conserva el polígono, incluidos los huecos', () => {
    const conHueco = {
      type: 'Polygon',
      coordinates: [
        ...POLIGONO.coordinates,
        [
          [-72.638, 7.271],
          [-72.635, 7.271],
          [-72.635, 7.274],
          [-72.638, 7.271],
        ],
      ],
    }
    expect(leafletAGeojson(geojsonALeaflet(conHueco))).toEqual(conHueco)
  })

  it('convierte puntos entre latitud, longitud y GeoJSON', () => {
    const punto = latLngAPunto(7.2705, -72.6395)
    expect(punto).toEqual({ type: 'Point', coordinates: [-72.6395, 7.2705] })
    expect(puntoALeaflet(punto)).toEqual([7.2705, -72.6395])
  })

  it('sugiere si un punto [lat, lng] cae dentro del polígono', () => {
    const cuadro = {
      type: 'Polygon',
      coordinates: [
        [
          [-72.64, 7.27],
          [-72.639, 7.27],
          [-72.639, 7.271],
          [-72.64, 7.271],
          [-72.64, 7.27],
        ],
      ],
    }
    expect(puntoEnPoligono([7.2705, -72.6395], cuadro)).toBe(true)
    expect(puntoEnPoligono([7.2705, -72.635], cuadro)).toBe(false)
    // Coordenadas invertidas: nunca caen dentro.
    expect(puntoEnPoligono([-72.6395, 7.2705], cuadro)).toBe(false)
  })
})
