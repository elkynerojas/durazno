// El token de acceso vive solo en memoria: un script inyectado no lo encuentra guardado y vence
// en minutos. Al recargar, la sesión se recupera con la cookie HttpOnly de renovación, que
// JavaScript no puede leer (HU-08.7).
let tokenAcceso = null

// Versiones anteriores guardaban los tokens en localStorage: se borran si quedaron.
try {
  localStorage.removeItem('icota.token')
  localStorage.removeItem('icota.renovacion')
} catch {
  // Almacenamiento bloqueado: no hay nada que borrar.
}

export const leerToken = () => tokenAcceso

export function guardarToken(acceso) {
  tokenAcceso = acceso
}

export function borrarToken() {
  tokenAcceso = null
}
