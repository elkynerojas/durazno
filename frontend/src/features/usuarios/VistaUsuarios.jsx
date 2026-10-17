import { useEffect, useState } from 'react'

import { actualizarUsuario, listarUsuarios } from '../../api/client'
import BarraSuperior from '../../components/BarraSuperior'
import { useSesion } from '../auth/useSesion'
import FormularioUsuario from './FormularioUsuario'
import { ROLES } from './roles'

const porNombre = (a, b) => a.nombre_completo.localeCompare(b.nombre_completo, 'es')

export default function VistaUsuarios() {
  const { usuario: actual } = useSesion()
  const [usuarios, setUsuarios] = useState(null)
  const [error, setError] = useState(null)
  // null: lista; 'nuevo': crear; objeto: editar ese usuario.
  const [edicion, setEdicion] = useState(null)

  useEffect(() => {
    listarUsuarios()
      .then(setUsuarios)
      .catch(() => setError('No se pudo cargar la lista de usuarios.'))
  }, [])

  function reemplazar(guardado) {
    setUsuarios((lista) => [...lista.filter((u) => u.id !== guardado.id), guardado].sort(porNombre))
  }

  async function alternarActivo(usuario) {
    setError(null)
    try {
      reemplazar(await actualizarUsuario(usuario.id, { activo: !usuario.activo }))
    } catch (e) {
      setError(e.estado === 409 ? e.message : 'No se pudo cambiar el estado de la cuenta.')
    }
  }

  return (
    <div className="app">
      <BarraSuperior />
      <main className="pagina">
        {edicion ? (
          <FormularioUsuario
            key={edicion === 'nuevo' ? 'nuevo' : edicion.id}
            usuario={edicion === 'nuevo' ? null : edicion}
            esPropio={edicion !== 'nuevo' && edicion.id === actual.id}
            alGuardar={(guardado) => {
              reemplazar(guardado)
              setEdicion(null)
            }}
            alCancelar={() => setEdicion(null)}
          />
        ) : (
          <>
            <div className="pagina__encabezado">
              <h2>Usuarios del predio</h2>
              <button type="button" className="boton-primario" onClick={() => setEdicion('nuevo')}>
                Nuevo usuario
              </button>
            </div>

            {error && (
              <p className="formulario__error" role="alert">
                {error}
              </p>
            )}
            {!usuarios && !error && <p className="cargando">Cargando…</p>}

            <ul className="lista-usuarios">
              {usuarios?.map((u) => (
                <li key={u.id} className={u.activo ? '' : 'lista-usuarios__inactivo'}>
                  <div>
                    <strong>{u.nombre_completo}</strong>
                    <span>{u.correo}</span>
                    <span>
                      {ROLES[u.rol]} · {u.activo ? 'Activo' : 'Desactivado'}
                    </span>
                  </div>
                  <div className="lista-usuarios__acciones">
                    <button
                      type="button"
                      className="boton-secundario"
                      onClick={() => setEdicion(u)}
                      aria-label={`Editar a ${u.nombre_completo}`}
                    >
                      Editar
                    </button>
                    {u.id !== actual.id && (
                      <button
                        type="button"
                        className="boton-secundario"
                        onClick={() => alternarActivo(u)}
                        aria-label={`${u.activo ? 'Desactivar' : 'Activar'} a ${u.nombre_completo}`}
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  )
}
