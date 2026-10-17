import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'

import EstadoApi from '../../components/EstadoApi'
import Logo from '../../components/Logo'
import { useSesion } from './useSesion'

// Solo rutas internas de la app: evita redirigir a otro sitio con un enlace preparado.
function destinoSeguro(desde) {
  return typeof desde === 'string' &&
    desde.startsWith('/') &&
    !desde.startsWith('//') &&
    desde !== '/'
    ? desde
    : '/mapa'
}

export default function InicioSesion() {
  const { usuario, cargando, entrar } = useSesion()
  const navegar = useNavigate()
  const { state } = useLocation()
  const destino = destinoSeguro(state?.desde)
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  if (cargando) return <p className="cargando">Cargando…</p>
  if (usuario) return <Navigate to={destino} replace />

  async function enviar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await entrar(correo.trim(), clave)
      navegar(destino, { replace: true })
    } catch (e) {
      setError(
        [401, 429].includes(e.estado) ? e.message : 'No se pudo iniciar sesión. Intente de nuevo.',
      )
      setEnviando(false)
    }
  }

  return (
    <main className="acceso">
      <section className="acceso__portada">
        <div className="marca">
          <Logo />
          <span className="marca__nombre">Trazabilidad Durazno</span>
        </div>
        <div className="acceso__lema">
          <p className="acceso__antetitulo">Plan Nacional de Moscas de la Fruta</p>
          <h1>Lotes, trampas y MTD del predio Icota en un solo mapa.</h1>
          <p>
            Georreferenciación de lotes y trampas Jackson y McPhail, códigos QR por trampa, rutas de
            monitoreo, planeación por semanas y cálculo del índice Mosca/Trampa/Día.
          </p>
        </div>
        <IlustracionPredio />
        <p className="acceso__creditos">
          Vereda Icota · Cácota, Norte de Santander · Semillero ORION · ISER
        </p>
      </section>

      <section className="acceso__panel">
        <form className="acceso__formulario formulario" onSubmit={enviar}>
          <h2>Iniciar sesión</h2>
          <p>Ingrese con la cuenta asignada por el agrónomo del predio.</p>
          {state?.aviso && (
            <p className="formulario__exito" role="status">
              {state.aviso}
            </p>
          )}

          <label htmlFor="correo">Correo electrónico</label>
          <input
            id="correo"
            name="correo"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            placeholder="usuario@icota.co"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
            autoFocus
          />

          <label htmlFor="clave">Contraseña</label>
          <input
            id="clave"
            name="clave"
            type="password"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
          />

          {error && (
            <p className="formulario__error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="boton-primario boton-bloque" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>

          <p className="acceso__roles">
            Roles disponibles: <strong>Técnico de campo</strong>, <strong>Productor</strong> y{' '}
            <strong>Agrónomo</strong>. Los permisos se asignan según el rol.
          </p>
          <div className="acceso__estado">
            <EstadoApi />
          </div>
        </form>
      </section>
    </main>
  )
}

// Lotes y una ruta de trampas, como en la portada del mockup.
function IlustracionPredio() {
  const lotes = [
    'M10 40 L140 25 L160 120 L35 140 Z',
    'M140 25 L285 15 L310 115 L160 120 Z',
    'M285 15 L420 30 L460 140 L310 115 Z',
    'M35 140 L160 120 L180 200 L55 200 Z',
    'M160 120 L310 115 L330 200 L180 200 Z',
  ]
  return (
    <svg className="acceso__ilustracion" viewBox="0 0 470 210" aria-hidden="true">
      {lotes.map((d) => (
        <path key={d} d={d} fill="#21423a" stroke="#2f5a4c" strokeWidth="2" />
      ))}
      <path
        d="M80 85 L230 72 L380 80"
        stroke="#e8875a"
        strokeWidth="2"
        strokeDasharray="6 5"
        fill="none"
      />
      {[
        [80, 85],
        [230, 72],
        [380, 80],
        [120, 172],
        [262, 168],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="6" fill="#e8875a" />
      ))}
    </svg>
  )
}
