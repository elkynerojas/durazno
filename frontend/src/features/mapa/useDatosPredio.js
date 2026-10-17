import { useEffect, useState } from 'react'

import { listarLotes, listarTrampas } from '../../api/client'

export const porCodigo = (a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })
export const porCodigoIca = (a, b) =>
  a.codigo_ica.localeCompare(b.codigo_ica, 'es', { numeric: true })

// Lotes y trampas vigentes del predio, ordenados. `lotesIniciales` encuadra el mapa una vez.
// Las vistas se vuelven a montar al cambiar de predio (PorPredio), así que se carga una vez.
export function useDatosPredio(predioId) {
  const [lotes, setLotes] = useState([])
  const [trampas, setTrampas] = useState([])
  const [lotesIniciales, setLotesIniciales] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    Promise.all([listarLotes(predioId), listarTrampas(predioId)])
      .then(([listaLotes, listaTrampas]) => {
        if (!vigente) return
        setLotes(listaLotes.sort(porCodigo))
        setTrampas(listaTrampas.sort(porCodigoIca))
        setLotesIniciales(listaLotes)
      })
      .catch(() => vigente && setError('No se pudieron cargar los lotes y las trampas.'))
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [predioId])

  const guardarLote = (lote) =>
    setLotes((lista) => [...lista.filter((l) => l.id !== lote.id), lote].sort(porCodigo))
  const quitarLote = (id) => setLotes((lista) => lista.filter((l) => l.id !== id))
  const guardarTrampa = (trampa) =>
    setTrampas((lista) => [...lista.filter((t) => t.id !== trampa.id), trampa].sort(porCodigoIca))

  return { lotes, trampas, lotesIniciales, cargando, error, guardarLote, quitarLote, guardarTrampa }
}
