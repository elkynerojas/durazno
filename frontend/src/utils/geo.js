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

// Point GeoJSON [lng, lat] → [lat, lng] de Leaflet.
export const puntoALeaflet = ({ coordinates: [lng, lat] }) => [lat, lng]

// Latitud y longitud decimales (como las escribe una persona) → Point GeoJSON.
export const latLngAPunto = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] })

// Ayuda visual: ¿el punto [lat, lng] cae dentro del anillo exterior del polígono GeoJSON?
// El servidor es quien decide (ST_Contains); esto solo sugiere el lote en el formulario.
export function puntoEnPoligono([lat, lng], poligono) {
  const anillo = poligono.coordinates[0]
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}
