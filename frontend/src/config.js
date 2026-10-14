// Centro aproximado del municipio de Cácota (Norte de Santander), WGS 84.
// Leaflet usa el orden [latitud, longitud]; GeoJSON usa [longitud, latitud].
export const CENTRO_CACOTA = [7.2667, -72.6417]
export const ZOOM_INICIAL = 14

export const CAPAS_BASE = {
  satelital: {
    nombre: 'Satelital (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    atribucion: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  calles: {
    nombre: 'Calles (OpenStreetMap)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '&copy; colaboradores de OpenStreetMap',
    maxZoom: 19,
  },
}
