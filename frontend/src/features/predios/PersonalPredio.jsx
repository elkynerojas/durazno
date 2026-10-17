import { useEffect, useState } from 'react'

import { asignarUsuario, listarPersonal, listarUsuarios, quitarUsuario } from '../../api/client'
import { ROLES } from '../usuarios/roles'

// Personal asignado a un predio: el administrador asigna o quita cuentas.
export default function PersonalPredio({ predio }) {
  const [personal, setPersonal] = useState(null)
  const [cuentas, setCuentas] = useState([])
  const [elegido, setElegido] = useState('')
  const [error, setError] = useState(null)

  const predioId = predio.id
  useEffect(() => {
    let vigente = true
    Promise.all([listarPersonal(predioId), listarUsuarios()])
      .then(([asignados, todas]) => {
        if (!vigente) return
        setPersonal(asignados)
        setCuentas(todas)
      })
      .catch(() => vigente && setError('No se pudo cargar el personal del predio.'))
    return () => {
      vigente = false
    }
  }, [predioId])

  // El administrador ve todos los predios sin asignación: no se ofrece asignarlo.
  const disponibles = cuentas.filter(
    (c) => c.activo && c.rol !== 'administrador' && !personal?.some((p) => p.id === c.id),
  )

  async function asignar(evento) {
    evento.preventDefault()
    setError(null)
    try {
      await asignarUsuario(predioId, elegido)
      setPersonal(await listarPersonal(predioId))
      setElegido('')
    } catch {
      setError('No se pudo asignar la cuenta.')
    }
  }

  async function quitar(persona) {
    setError(null)
    try {
      await quitarUsuario(predioId, persona.id)
      setPersonal((lista) => lista.filter((p) => p.id !== persona.id))
    } catch {
      setError('No se pudo quitar la cuenta.')
    }
  }

  return (
    <section aria-labelledby="titulo-personal">
      <h2 id="titulo-personal" className="tarjeta__titulo">
        Personal de {predio.nombre}
      </h2>
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      {personal === null && !error && <p className="cargando">Cargando…</p>}
      {personal?.length === 0 && (
        <p className="formulario__nota">Nadie está asignado a este predio todavía.</p>
      )}
      <ul className="lista-simple">
        {personal?.map((p) => (
          <li key={p.id}>
            <span>
              <strong>{p.nombre_completo}</strong> · {ROLES[p.rol]}
            </span>
            <button
              type="button"
              className="enlace"
              onClick={() => quitar(p)}
              aria-label={`Quitar a ${p.nombre_completo} de ${predio.nombre}`}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <form className="formulario personal__asignar" onSubmit={asignar}>
        <label htmlFor="cuenta_asignar">Asignar una cuenta</label>
        <select
          id="cuenta_asignar"
          value={elegido}
          onChange={(e) => setElegido(e.target.value)}
          required
        >
          <option value="" disabled>
            {disponibles.length ? 'Seleccione' : 'No hay cuentas disponibles'}
          </option>
          {disponibles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre_completo} · {ROLES[c.rol]}
            </option>
          ))}
        </select>
        <div className="formulario__acciones formulario__acciones--inicio">
          <button type="submit" className="boton-primario" disabled={!elegido}>
            Asignar
          </button>
        </div>
      </form>
    </section>
  )
}
