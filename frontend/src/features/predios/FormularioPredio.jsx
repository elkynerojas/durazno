import { useState } from 'react'

import { actualizarPredio, crearPredio } from '../../api/client'

const VACIO = { nombre: '', vereda: '', municipio: 'Cácota', registro_ica: '', area_ha: '' }

function aFormulario(predio) {
  if (!predio) return VACIO
  const { nombre, vereda, municipio, registro_ica, area_ha } = predio
  return { nombre, vereda, municipio, registro_ica: registro_ica ?? '', area_ha: String(area_ha) }
}

// Datos de un predio. Sin `predio` crea uno nuevo (administrador); con `predio` lo actualiza.
export default function FormularioPredio({ predio, editable, alGuardar, alCancelar }) {
  const nuevo = !predio
  // El id se genera una sola vez: si el registro se reenvía, la API no duplica el predio.
  const [id] = useState(() => globalThis.crypto?.randomUUID?.())
  const [datos, setDatos] = useState(() => aFormulario(predio))
  const [estado, setEstado] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const cambiar = (campo) => (evento) =>
    setDatos((previos) => ({ ...previos, [campo]: evento.target.value }))

  async function enviar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setEstado(null)
    const cuerpo = {
      ...datos,
      registro_ica: datos.registro_ica.trim() || null,
      area_ha: Number(datos.area_ha),
      // PUT reemplaza todo: se reenvía el límite que ya tenía para no borrarlo.
      limite: predio?.limite ?? null,
    }
    try {
      const guardado = nuevo
        ? await crearPredio({ ...(id && { id }), ...cuerpo })
        : await actualizarPredio(predio.id, cuerpo)
      setEstado({ exito: nuevo ? 'Predio creado.' : 'Datos del predio guardados.' })
      alGuardar(guardado)
    } catch (e) {
      setEstado({
        error: e.estado === 422 ? 'Revise los datos del formulario.' : 'No se pudo guardar.',
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={enviar} aria-label="Datos del predio">
      <h2>{nuevo ? 'Nuevo predio' : 'Identificación ante el ICA'}</h2>
      <fieldset disabled={!editable || enviando}>
        <label htmlFor="nombre_predio">Nombre</label>
        <input
          id="nombre_predio"
          value={datos.nombre}
          onChange={cambiar('nombre')}
          maxLength={150}
          required
        />
        <div className="formulario__fila">
          <div>
            <label htmlFor="vereda">Vereda</label>
            <input
              id="vereda"
              value={datos.vereda}
              onChange={cambiar('vereda')}
              maxLength={100}
              required
            />
          </div>
          <div>
            <label htmlFor="municipio">Municipio</label>
            <input
              id="municipio"
              value={datos.municipio}
              onChange={cambiar('municipio')}
              maxLength={100}
              required
            />
          </div>
        </div>
        <div className="formulario__fila">
          <div>
            <label htmlFor="registro_ica">Registro ICA del predio</label>
            <input
              id="registro_ica"
              value={datos.registro_ica}
              onChange={cambiar('registro_ica')}
              maxLength={50}
            />
          </div>
          <div>
            <label htmlFor="area_ha">Área (hectáreas)</label>
            <input
              id="area_ha"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={datos.area_ha}
              onChange={cambiar('area_ha')}
              required
            />
          </div>
        </div>
      </fieldset>

      {predio && (
        <p className="formulario__nota">
          {predio.limite ? 'Tiene límite dibujado en el mapa.' : 'Sin límite dibujado.'}
        </p>
      )}
      {estado?.error && (
        <p className="formulario__error" role="alert">
          {estado.error}
        </p>
      )}
      {estado?.exito && (
        <p className="formulario__exito" role="status">
          {estado.exito}
        </p>
      )}
      {editable && (
        <div className="formulario__acciones">
          {alCancelar && (
            <button type="button" className="boton-secundario" onClick={alCancelar}>
              Cancelar
            </button>
          )}
          <button type="submit" className="boton-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : nuevo ? 'Crear predio' : 'Guardar'}
          </button>
        </div>
      )}
    </form>
  )
}
