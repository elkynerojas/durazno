import { useCallback, useState } from 'react'
import { Link, NavLink } from 'react-router'

import { useSesion } from '../features/auth/useSesion'
import { usePredio } from '../features/predios/usePredio'
import { ROLES } from '../features/usuarios/roles'
import { rangoSemana, semanaIso } from '../utils/fechas'
import EstadoApi from './EstadoApi'
import Logo from './Logo'
import ModalAyuda from './ModalAyuda'

// Secciones del aplicativo; algunas solo para ciertos roles.
const SECCIONES = [
  { a: '/mi-semana', texto: 'Mi semana', roles: ['tecnico', 'agronomo'] },
  { a: '/mapa', texto: 'Mapa' },
  { a: '/lotes', texto: 'Lotes' },
  { a: '/trampas', texto: 'Trampas y QR' },
  { a: '/rutas', texto: 'Rutas de monitoreo' },
  { a: '/plan', texto: 'Planeación' },
  { a: '/lecturas', texto: 'Lecturas de trampa', roles: ['tecnico', 'agronomo', 'administrador'] },
  { a: '/mtd', texto: 'MTD e historial' },
  { a: '/predio', texto: 'Predio' },
  { a: '/usuarios', texto: 'Usuarios', roles: ['administrador'] },
]

export default function Plantilla({ children }) {
  const { usuario, salir } = useSesion()
  const { predios, predio, seleccionar } = usePredio()
  const [abierto, setAbierto] = useState(false)
  const [ayuda, setAyuda] = useState(false)
  const cerrarAyuda = useCallback(() => setAyuda(false), [])
  const semana = semanaIso()

  return (
    <div className="plantilla">
      <aside className={`lateral${abierto ? ' lateral--abierto' : ''}`}>
        <Link to="/mapa" className="marca marca--lateral" aria-label="PERSICA: ir al mapa">
          <Logo className="marca__logo marca__logo--lateral" />
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
          <button
            type="button"
            className="lateral__ayuda"
            aria-haspopup="dialog"
            onClick={() => {
              setAbierto(false)
              setAyuda(true)
            }}
          >
            Ayuda
          </button>
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
      {ayuda && <ModalAyuda alCerrar={cerrarAyuda} />}
    </div>
  )
}
