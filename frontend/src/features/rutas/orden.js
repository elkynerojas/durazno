import { distanciaAproximadaM } from '../../utils/geo'

// Mueve el elemento de la posición `desde` a la posición `hasta`.
export function mover(lista, desde, hasta) {
  const copia = [...lista]
  const [elemento] = copia.splice(desde, 1)
  copia.splice(hasta, 0, elemento)
  return copia
}

// Orden con el que se empieza a editar la ruta guardada: se quitan las trampas que ya no están
// activas y se agregan al final las activas que falten (HU-20 avisa estos cambios).
export function ordenInicial(ruta, activas) {
  const ids = new Set(activas.map((t) => t.id))
  const guardado = ruta.paradas.map((p) => p.trampa_id)
  const orden = guardado.filter((id) => ids.has(id))
  const agregadas = activas.filter((t) => !orden.includes(t.id))
  return {
    orden: [...orden, ...agregadas.map((t) => t.id)],
    quitadas: ruta.paradas.filter((p) => !ids.has(p.trampa_id)).map((p) => p.codigo_ica),
    agregadas: agregadas.map((t) => t.codigo_ica),
  }
}

// Trampas activas que faltan en el orden (la API exige todas, una vez cada una).
export const faltantes = (orden, activas) => activas.filter((t) => !orden.includes(t.id))

// Distancia aproximada de cada tramo (null en la primera parada) y total, en metros.
export function tramos(orden, porId) {
  const distancias = orden.map((id, i) =>
    i === 0 ? null : distanciaAproximadaM(porId.get(orden[i - 1]).geom, porId.get(id).geom),
  )
  return { distancias, total: distancias.reduce((suma, d) => suma + (d ?? 0), 0) }
}
