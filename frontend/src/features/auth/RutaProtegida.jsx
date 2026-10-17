import { Navigate, Outlet } from 'react-router'

import { useSesion } from './useSesion'

// `roles` (opcional) restringe la vista; la API vuelve a validar el rol en cada petición.
export default function RutaProtegida({ roles }) {
  const { usuario, cargando } = useSesion()

  if (cargando) return <p className="cargando">Cargando…</p>
  if (!usuario) return <Navigate to="/" replace />
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/mapa" replace />
  return <Outlet />
}
