import { useEffect, useState } from 'react'

import {
  ErrorApi,
  actualizarTipoHallazgo,
  crearTipoHallazgo,
  listarTiposHallazgo,
} from '../../api/client'

const COLOR_NUEVO = '#d35400'

const mensajeDeError = (e) =>
  e instanceof ErrorApi && typeof e.detalle === 'string'
    ? e.detalle
    : 'No se pudo guardar el tipo de hallazgo.'

// Catálogo de tipos de hallazgo (HU-40): solo el administrador lo ve. Un tipo no se borra, se
// desactiva; los hallazgos que ya lo usan lo conservan.
export default function AdministrarTipos() {
  const [tipos, setTipos] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState(COLOR_NUEVO)
  const [edicion, setEdicion] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    listarTiposHallazgo(true)
      .then((lista) => vigente && setTipos(lista))
      .catch(() => vigente && setError('No se pudieron cargar los tipos de hallazgo.'))
    return () => {
      vigente = false
    }
  }, [])

  async function guardar(accion, exito) {
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const tipo = await accion()
      setTipos((lista) => {
        const otros = lista.filter((t) => t.id !== tipo.id)
        return [...otros, tipo].sort(
          (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre),
        )
      })
      setAviso(exito(tipo))
      return true
    } catch (e) {
      setError(mensajeDeError(e))
      return false
    } finally {
      setGuardando(false)
    }
  }

  async function crear(evento) {
    evento.preventDefault()
    const orden = Math.max(0, ...(tipos ?? []).map((t) => t.orden)) + 10
    const creado = await guardar(
      () => crearTipoHallazgo({ id: crypto.randomUUID(), nombre, color, orden }),
      (t) => `Tipo «${t.nombre}» agregado.`,
    )
    if (creado) {
      setNombre('')
      setColor(COLOR_NUEVO)
    }
  }

  async function guardarEdicion(evento) {
    evento.preventDefault()
    const guardado = await guardar(
      () => actualizarTipoHallazgo(edicion.id, { nombre: edicion.nombre, color: edicion.color }),
      (t) => `Tipo «${t.nombre}» actualizado.`,
    )
    if (guardado) setEdicion(null)
  }

  const alternarActivo = (tipo) =>
    guardar(
      () => actualizarTipoHallazgo(tipo.id, { activo: !tipo.activo }),
      (t) => `Tipo «${t.nombre}» ${t.activo ? 'activado' : 'desactivado'}.`,
    )

  return (
    <div className="columna">
      <form className="tarjeta formulario" onSubmit={crear} aria-label="Nuevo tipo de hallazgo">
        <h2 className="tarjeta__titulo">Nuevo tipo de hallazgo</h2>
        <div className="formulario__fila">
          <div>
            <label htmlFor="tipo_nombre">Nombre</label>
            <input
              id="tipo_nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={60}
              placeholder="Ej. Gomosis"
              required
            />
          </div>
          <div>
            <label htmlFor="tipo_color">Color en el mapa</label>
            <input
              id="tipo_color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
        </div>
        <div className="formulario__acciones">
          <button type="submit" className="boton-primario" disabled={guardando || !nombre.trim()}>
            Agregar tipo
          </button>
        </div>
      </form>

      {aviso && (
        <p className="formulario__exito" role="status">
          {aviso}
        </p>
      )}
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      {!tipos && !error && <p className="cargando">Cargando tipos…</p>}

      {tipos && (
        <section className="tarjeta tarjeta--sin-relleno" aria-label="Tipos de hallazgo">
          <div className="tarjeta__cabecera">
            <h2 className="tarjeta__titulo">Tipos de hallazgo</h2>
          </div>
          <ul className="lista-usuarios">
            {tipos.map((t) =>
              edicion?.id === t.id ? (
                <li key={t.id}>
                  <form
                    className="formulario tipo-hallazgo__edicion"
                    onSubmit={guardarEdicion}
                    aria-label={`Editar ${t.nombre}`}
                  >
                    <input
                      aria-label="Nombre"
                      value={edicion.nombre}
                      maxLength={60}
                      required
                      onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })}
                    />
                    <input
                      aria-label="Color"
                      type="color"
                      value={edicion.color}
                      onChange={(e) => setEdicion({ ...edicion, color: e.target.value })}
                    />
                    <button type="submit" className="boton-primario" disabled={guardando}>
                      Guardar
                    </button>
                    <button
                      type="button"
                      className="boton-secundario"
                      onClick={() => setEdicion(null)}
                    >
                      Cancelar
                    </button>
                  </form>
                </li>
              ) : (
                <li key={t.id} className={t.activo ? '' : 'lista-usuarios__inactivo'}>
                  <div className="tipo-hallazgo">
                    <span
                      className="tipo-hallazgo__muestra"
                      style={{ background: t.color }}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{t.nombre}</strong>
                      <span>{t.activo ? 'Activo' : 'Desactivado'}</span>
                    </div>
                  </div>
                  <div className="lista-usuarios__acciones">
                    <button
                      type="button"
                      className="boton-secundario"
                      onClick={() => setEdicion({ id: t.id, nombre: t.nombre, color: t.color })}
                      aria-label={`Editar ${t.nombre}`}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="boton-secundario"
                      disabled={guardando}
                      onClick={() => alternarActivo(t)}
                      aria-label={`${t.activo ? 'Desactivar' : 'Activar'} ${t.nombre}`}
                    >
                      {t.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        </section>
      )}
    </div>
  )
}
