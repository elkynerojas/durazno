import { NavLink } from 'react-router'

import { useSesion } from '../features/auth/useSesion'
import EstadoApi from './EstadoApi'

export default function BarraSuperior() {
  const { usuario, salir } = useSesion()

  return (
    <header className="barra">
      <div>
        <h1>Trampeo de moscas de la fruta</h1>
        <p>Cultivo de durazno · Vereda Icota, Cácota</p>
      </div>
      <nav className="barra__acciones" aria-label="Principal">
        <NavLink to="/mapa" className="barra__enlace">
          Mapa
        </NavLink>
        {usuario.rol === 'agronomo' && (
          <NavLink to="/usuarios" className="barra__enlace">
            Usuarios
          </NavLink>
        )}
        <EstadoApi />
        <span className="barra__usuario">{usuario.nombre_completo}</span>
        <button type="button" className="boton-secundario" onClick={salir}>
          Salir
        </button>
      </nav>
    </header>
  )
}
