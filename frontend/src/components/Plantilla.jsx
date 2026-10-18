import { useState } from 'react'
import { Link, NavLink } from 'react-router'

import { useSesion } from '../features/auth/useSesion'
import { usePredio } from '../features/predios/usePredio'
import { ROLES } from '../features/usuarios/roles'
import { rangoSemana, semanaIso } from '../utils/fechas'
import EstadoApi from './EstadoApi'
import Logo from './Logo'

// Secciones del aplicativo; algunas solo para ciertos roles.
const SECCIONES = [
  { a: '/mi-semana', texto: 'Mi semana', roles: ['tecnico', 'agronomo'] },
  { a: '/mapa', texto: 'Mapa del predio' },
  { a: '/lotes', texto: 'Lotes' },
  { a: '/trampas', texto: 'Trampas y QR' },
  { a: '/rutas', texto: 'Rutas de monitoreo' },
  { a: '/plan', texto: 'Planeación' },
  { a: '/lecturas', texto: 'Lecturas de trampa', roles: ['agronomo', 'administrador'] },
  { a: '/mtd', texto: 'MTD e historial' },
  { a: '/predio', texto: 'Datos del predio' },
  { a: '/predios', texto: 'Predios', roles: ['administrador'] },
  { a: '/usuarios', texto: 'Usuarios', roles: ['administrador'] },
]

export default function Plantilla({ children }) {
  const { usuario, salir } = useSesion()
  const { predios, predio, seleccionar } = usePredio()
  const [abierto, setAbierto] = useState(false)
  const semana = semanaIso()

  return (
    <div className="plantilla">
      <aside className={`lateral${abierto ? ' lateral--abierto' : ''}`}>
        <Link to="/mapa" className="marca">
          <Logo />
          <span>
            <span className="marca__nombre">Trazabilidad Durazno</span>
            <span className="marca__lugar">
              {predio ? `${predio.vereda} · ${predio.municipio}` : 'Sin predio asignado'}
            </span>
          </span>
        </Link>
        <button
          type="button"
          className="lateral__menu"
          aria-expanded={abierto}
          aria-controls="menu-principal"
          onClick={() => setAbierto((a) => !a)}
        >
          Menú
        </button>

        {predios?.length > 1 && (
          <div className="lateral__predio">
            <label htmlFor="predio_actual">Predio</label>
            <select
              id="predio_actual"
              value={predio?.id ?? ''}
              onChange={(e) => seleccionar(e.target.value)}
            >
              {predios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav id="menu-principal" className="lateral__nav" aria-label="Principal">
          {SECCIONES.filter((s) => !s.roles || s.roles.includes(usuario.rol)).map((s) => (
            <NavLink key={s.a} to={s.a} onClick={() => setAbierto(false)}>
              {s.texto}
            </NavLink>
          ))}
        </nav>

        <div className="lateral__pie">
          <div className="lateral__semana">
            <p>PNMF · ICA</p>
            <p>
              Semana {semana.numero} · {rangoSemana(semana)}
            </p>
            <p>
              <strong>Rol: {ROLES[usuario.rol]}</strong>
            </p>
          </div>
          <div className="lateral__usuario">
            <span>{usuario.nombre_completo}</span>
            <button type="button" className="boton-secundario" onClick={salir}>
              Salir
            </button>
          </div>
          <EstadoApi />
        </div>
      </aside>
      <main className="principal">{children}</main>
    </div>
  )
}
