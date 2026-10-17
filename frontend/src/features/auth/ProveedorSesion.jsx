import { useCallback, useEffect, useState } from 'react'

import {
  EVENTO_SESION_CERRADA,
  cerrarSesion,
  iniciarSesion,
  obtenerUsuarioActual,
  restaurarSesion,
} from '../../api/client'
import { borrarToken, guardarToken } from './sesion'
import { ContextoSesion } from './useSesion'

export function ProveedorSesion({ children }) {
  const [usuario, setUsuario] = useState(null)
  // La cookie de renovación no se puede leer: siempre se intenta recuperar la sesión al abrir.
  const [cargando, setCargando] = useState(true)

  const olvidar = useCallback(() => {
    borrarToken()
    setUsuario(null)
  }, [])

  const salir = useCallback(() => {
    olvidar()
    cerrarSesion()
  }, [olvidar])

  useEffect(() => {
    restaurarSesion()
      .then((recuperada) => (recuperada ? obtenerUsuarioActual().then(setUsuario) : null))
      .catch(olvidar)
      .finally(() => setCargando(false))
  }, [olvidar])

  useEffect(() => {
    window.addEventListener(EVENTO_SESION_CERRADA, olvidar)
    return () => window.removeEventListener(EVENTO_SESION_CERRADA, olvidar)
  }, [olvidar])

  const entrar = useCallback(async (correo, clave) => {
    const { access_token } = await iniciarSesion(correo, clave)
    guardarToken(access_token)
    setUsuario(await obtenerUsuarioActual())
  }, [])

  return (
    <ContextoSesion.Provider value={{ usuario, cargando, entrar, salir }}>
      {children}
    </ContextoSesion.Provider>
  )
}
