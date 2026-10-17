import { Navigate, Outlet, useLocation } from 'react-router'

import { useSesion } from './useSesion'

// `roles` (opcional) restringe la vista; la API vuelve a validar el rol en cada petición.
export default function RutaProtegida({ roles }) {
  const { usuario, cargando } = useSesion()
  const ubicacion = useLocation()

  if (cargando) return <p className="cargando">Cargando…</p>
  // Recuerda la ruta pedida (p. ej. /t/<código> al escanear un QR) para volver tras entrar.
  if (!usuario) {
    return <Navigate to="/" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />
  }
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/mapa" replace />
  return <Outlet />
}
