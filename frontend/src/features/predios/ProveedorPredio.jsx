import { useCallback, useEffect, useState } from 'react'

import { listarPredios } from '../../api/client'
import { useSesion } from '../auth/useSesion'
import { ContextoPredio } from './usePredio'

// El predio elegido se recuerda en este navegador (solo una preferencia; la API valida el acceso).
const CLAVE = 'icota.predio'

function leerElegido() {
  try {
    return localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}

function guardarElegido(id) {
  try {
    localStorage.setItem(CLAVE, id)
  } catch {
    // Almacenamiento bloqueado: la elección dura mientras la pestaña esté abierta.
  }
}

export function ProveedorPredio({ children }) {
  const { usuario } = useSesion()
  const usuarioId = usuario?.id ?? null
  // Los predios quedan marcados con el usuario para el que se cargaron: al cambiar de sesión no se
  // muestran los del usuario anterior mientras llegan los nuevos.
  const [cargados, setCargados] = useState({ usuarioId: null, predios: null, error: null })
  const [elegidoId, setElegidoId] = useState(leerElegido)

  const recargar = useCallback(async () => {
    if (!usuarioId) return
    try {
      setCargados({ usuarioId, predios: await listarPredios(), error: null })
    } catch {
      setCargados({ usuarioId, predios: [], error: 'No se pudieron cargar los predios.' })
    }
  }, [usuarioId])

  useEffect(() => {
    if (!usuarioId) return
    let vigente = true
    listarPredios()
      .then((lista) => vigente && setCargados({ usuarioId, predios: lista, error: null }))
      .catch(
        () =>
          vigente &&
          setCargados({ usuarioId, predios: [], error: 'No se pudieron cargar los predios.' }),
      )
    return () => {
      vigente = false
    }
  }, [usuarioId])

  const vigentes = cargados.usuarioId === usuarioId ? cargados : { predios: null, error: null }
  const { predios, error } = vigentes

  const seleccionar = useCallback((id) => {
    setElegidoId(id)
    guardarElegido(id)
  }, [])

  // Si el predio recordado ya no está asignado, se usa el primero disponible.
  const predio = predios?.find((p) => p.id === elegidoId) ?? predios?.[0] ?? null

  return (
    <ContextoPredio.Provider
      value={{ predios, predio, seleccionar, recargar, cargando: predios === null, error }}
    >
      {children}
    </ContextoPredio.Provider>
  )
}
