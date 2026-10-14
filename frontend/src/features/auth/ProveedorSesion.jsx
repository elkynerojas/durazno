import { useCallback, useEffect, useState } from 'react'

import { EVENTO_SESION_CERRADA, iniciarSesion, obtenerUsuarioActual } from '../../api/client'
import { borrarToken, guardarToken, leerToken } from './sesion'
import { ContextoSesion } from './useSesion'

export function ProveedorSesion({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(() => Boolean(leerToken()))

  const salir = useCallback(() => {
    borrarToken()
    setUsuario(null)
  }, [])

  // Recupera la sesión guardada al recargar la página.
  useEffect(() => {
    if (!leerToken()) return
    obtenerUsuarioActual()
      .then(setUsuario)
      .catch(salir)
      .finally(() => setCargando(false))
  }, [salir])

  useEffect(() => {
    window.addEventListener(EVENTO_SESION_CERRADA, salir)
    return () => window.removeEventListener(EVENTO_SESION_CERRADA, salir)
  }, [salir])

  const entrar = useCallback(async (correo, clave) => {
    const { access_token, refresh_token } = await iniciarSesion(correo, clave)
    guardarToken(access_token, refresh_token)
    setUsuario(await obtenerUsuarioActual())
  }, [])

  return (
    <ContextoSesion.Provider value={{ usuario, cargando, entrar, salir }}>
      {children}
    </ContextoSesion.Provider>
  )
}
