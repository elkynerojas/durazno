import { Navigate, Outlet } from 'react-router'

import { useSesion } from './useSesion'

export default function RutaProtegida() {
  const { usuario, cargando } = useSesion()

  if (cargando) return <p className="cargando">Cargando…</p>
  if (!usuario) return <Navigate to="/" replace />
  return <Outlet />
}
