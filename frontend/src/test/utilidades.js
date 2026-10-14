import { vi } from 'vitest'

// Respuesta mínima compatible con fetch para simular la API.
export function respuestaJson(estado, cuerpo) {
  return {
    ok: estado >= 200 && estado < 300,
    status: estado,
    json: () => Promise.resolve(cuerpo),
  }
}

// Reemplaza fetch por una función que devuelve las respuestas en orden.
export function simularFetch(...respuestas) {
  const fetchSimulado = vi.fn()
  respuestas.forEach((r) => fetchSimulado.mockResolvedValueOnce(r))
  vi.stubGlobal('fetch', fetchSimulado)
  return fetchSimulado
}
