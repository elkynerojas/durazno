import { useState } from 'react'

import { actualizarUsuario, crearUsuario } from '../../api/client'
import AvisoDatos from './AvisoDatos'
import { ROLES } from './roles'

function mensajeDeError(error) {
  // 403 (clave actual), 409 (correo repetido) y 422 (clave trivial) traen un mensaje claro.
  if ([403, 409, 422].includes(error.estado) && typeof error.detalle === 'string') {
    return error.message
  }
  if (error.estado === 422) return 'Revise los datos del formulario.'
  return 'No se pudo guardar. Intente de nuevo.'
}

// Sin `usuario` crea una cuenta; con `usuario` la edita. `esPropio` bloquea el cambio de rol.
export default function FormularioUsuario({ usuario, esPropio = false, alGuardar, alCancelar }) {
  const editando = Boolean(usuario)
  // El id se genera una sola vez: si el envío se repite, la API no duplica la cuenta.
  // `randomUUID` solo existe en contexto seguro (HTTPS o localhost); sin él, la API asigna el id.
  const [id] = useState(() => globalThis.crypto?.randomUUID?.())
  const [datos, setDatos] = useState({
    nombre_completo: usuario?.nombre_completo ?? '',
    correo: usuario?.correo ?? '',
    rol: usuario?.rol ?? 'tecnico',
    clave: '',
    clave_actual: '',
    autorizacion_datos: false,
  })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const cambiar = (campo) => (evento) => {
    const { type, checked, value } = evento.target
    setDatos((previos) => ({ ...previos, [campo]: type === 'checkbox' ? checked : value }))
  }

  async function enviar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    const { clave, clave_actual, autorizacion_datos, ...resto } = datos
    try {
      const guardado = editando
        ? await actualizarUsuario(usuario.id, {
            ...resto,
            ...(clave && { clave }),
            ...(clave && esPropio && { clave_actual }),
          })
        : await crearUsuario({ ...(id && { id }), ...resto, clave, autorizacion_datos })
      // Cambiar la propia clave cierra todas las sesiones de la cuenta, incluida esta.
      alGuardar(guardado, { claveCambiada: Boolean(clave) && esPropio })
    } catch (e) {
      setError(mensajeDeError(e))
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <h2>{editando ? 'Editar usuario' : 'Nuevo usuario'}</h2>

      <label htmlFor="nombre_completo">Nombre completo</label>
      <input
        id="nombre_completo"
        value={datos.nombre_completo}
        onChange={cambiar('nombre_completo')}
        maxLength={150}
        required
      />

      <label htmlFor="correo_usuario">Correo</label>
      <input
        id="correo_usuario"
        type="email"
        autoCapitalize="none"
        value={datos.correo}
        onChange={cambiar('correo')}
        required
      />

      <label htmlFor="rol">Rol</label>
      <select id="rol" value={datos.rol} onChange={cambiar('rol')} disabled={esPropio}>
        {Object.entries(ROLES).map(([valor, etiqueta]) => (
          <option key={valor} value={valor}>
            {etiqueta}
          </option>
        ))}
      </select>

      <label htmlFor="clave_usuario">
        {editando ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
      </label>
      <input
        id="clave_usuario"
        type="password"
        autoComplete="new-password"
        value={datos.clave}
        onChange={cambiar('clave')}
        minLength={8}
        maxLength={128}
        required={!editando}
      />

      {esPropio && datos.clave && (
        <>
          <label htmlFor="clave_actual">Contraseña actual</label>
          <input
            id="clave_actual"
            type="password"
            autoComplete="current-password"
            value={datos.clave_actual}
            onChange={cambiar('clave_actual')}
            maxLength={128}
            required
          />
          <p className="formulario__nota">
            Al cambiar su contraseña se cerrarán todas sus sesiones y deberá ingresar de nuevo.
          </p>
        </>
      )}

      {!editando && (
        <>
          <AvisoDatos />
          <label className="formulario__casilla">
            <input
              type="checkbox"
              checked={datos.autorizacion_datos}
              onChange={cambiar('autorizacion_datos')}
              required
            />
            El titular fue informado de este aviso y autorizó el tratamiento de sus datos.
          </label>
        </>
      )}

      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}

      <div className="formulario__acciones">
        <button type="button" className="boton-secundario" onClick={alCancelar}>
          Cancelar
        </button>
        <button type="submit" className="boton-primario" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
