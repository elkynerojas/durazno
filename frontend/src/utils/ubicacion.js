// Ubicación del teléfono con la Geolocation API (HU-12). Exige HTTPS (o localhost).

// Precisión máxima aceptable para ubicar una trampa, en metros. Pendiente de acordar con Icota.
export const UMBRAL_PRECISION_M = 10

const MENSAJES = {
  1: 'No dio permiso para usar la ubicación. Actívelo en el navegador e intente de nuevo.',
  2: 'El teléfono no pudo obtener la ubicación. Revise que el GPS esté encendido.',
  3: 'El GPS tardó demasiado. Intente de nuevo a cielo abierto.',
}

// Escucha el GPS durante `duracionMs` y se queda con la lectura más precisa; termina antes si
// alcanza `objetivoM`. `alAvanzar` recibe cada mejora ({ lat, lng, precision }).
export function obtenerUbicacion({
  duracionMs = 15_000,
  objetivoM = UMBRAL_PRECISION_M / 2,
  alAvanzar,
} = {}) {
  return new Promise((resolver, rechazar) => {
    if (!window.isSecureContext) {
      rechazar(new Error('La ubicación del teléfono solo funciona con la página abierta en HTTPS.'))
      return
    }
    if (!navigator.geolocation) {
      rechazar(new Error('Este navegador no permite usar la ubicación del teléfono.'))
      return
    }
    let mejor = null
    let vigilancia = null
    let temporizador = null
    const terminar = () => {
      navigator.geolocation.clearWatch(vigilancia)
      clearTimeout(temporizador)
      if (mejor) resolver(mejor)
      else rechazar(new Error(MENSAJES[3]))
    }
    vigilancia = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (mejor && coords.accuracy >= mejor.precision) return
        mejor = { lat: coords.latitude, lng: coords.longitude, precision: coords.accuracy }
        alAvanzar?.(mejor)
        if (mejor.precision <= objetivoM) terminar()
      },
      (error) => {
        // Si ya hubo una lectura, se usa; si no, se informa el problema.
        if (mejor) return terminar()
        navigator.geolocation.clearWatch(vigilancia)
        clearTimeout(temporizador)
        rechazar(new Error(MENSAJES[error.code] ?? MENSAJES[2]))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: duracionMs },
    )
    temporizador = setTimeout(terminar, duracionMs)
  })
}
