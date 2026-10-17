// Único lugar donde se convierte entre el orden de Leaflet y el de GeoJSON.
// Leaflet usa [latitud, longitud]; GeoJSON (RFC 7946) usa [longitud, latitud].

// Polygon GeoJSON → anillos de Leaflet [[lat, lng], ...], sin repetir el punto de cierre.
export function geojsonALeaflet(poligono) {
  return poligono.coordinates.map((anillo) => anillo.slice(0, -1).map(([lng, lat]) => [lat, lng]))
}

// Anillos de Leaflet (`polygon.getLatLngs()`: LatLng o [lat, lng]) → Polygon GeoJSON con cada
// anillo cerrado.
export function leafletAGeojson(anillos) {
  return {
    type: 'Polygon',
    coordinates: anillos.map((anillo) => {
      const puntos = anillo.map((p) => (Array.isArray(p) ? [p[1], p[0]] : [p.lng, p.lat]))
      const [primero] = puntos
      const ultimo = puntos.at(-1)
      const cerrado = primero[0] === ultimo[0] && primero[1] === ultimo[1]
      return cerrado ? puntos : [...puntos, primero]
    }),
  }
}
