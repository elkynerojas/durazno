import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'

import EstadoApi from '../../components/EstadoApi'
import { useSesion } from './useSesion'

export default function InicioSesion() {
  const { usuario, cargando, entrar } = useSesion()
  const navegar = useNavigate()
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  if (cargando) return <p className="cargando">Cargando…</p>
  if (usuario) return <Navigate to="/mapa" replace />

  async function enviar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await entrar(correo.trim(), clave)
      navegar('/mapa', { replace: true })
    } catch (e) {
      setError(
        [401, 429].includes(e.estado) ? e.message : 'No se pudo iniciar sesión. Intente de nuevo.',
      )
      setEnviando(false)
    }
  }

  return (
    <main className="acceso">
      <form className="acceso__tarjeta" onSubmit={enviar}>
        <h1>Trampeo de moscas de la fruta</h1>
        <p className="acceso__subtitulo">Cultivo de durazno · Vereda Icota, Cácota</p>

        <label htmlFor="correo">Correo</label>
        <input
          id="correo"
          name="correo"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
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
          <p className="acceso__error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>

        <div className="acceso__estado">
          <EstadoApi />
        </div>
      </form>
    </main>
  )
}
