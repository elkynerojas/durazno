import { useState } from 'react'

import { actualizarLote, crearLote, eliminarLote } from '../../api/client'

const formatoHa = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

function mensajeDeError(error) {
  if (typeof error.detalle === 'string') return error.detalle
  if (error.estado === 422) return 'Revise los datos del lote.'
  return 'No se pudo guardar. Intente de nuevo.'
}

// Panel del lote seleccionado o recién dibujado. Sin `lote`, crea uno con `geomNueva`.
// `obtenerForma` devuelve el polígono editado en el mapa (GeoJSON) cuando `editandoForma`.
export default function PanelLote({
  lote,
  geomNueva,
  advertencias = [],
  editable,
  editandoForma = false,
  obtenerForma,
  alEditarForma,
  alGuardar,
  alEliminar,
  alCerrar,
}) {
  const nuevo = !lote
  // El id se genera una sola vez: si el envío se repite, la API no duplica el lote.
  const [id] = useState(() => globalThis.crypto?.randomUUID?.())
  const [codigo, setCodigo] = useState(lote?.codigo ?? '')
  const [nombre, setNombre] = useState(lote?.nombre ?? '')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  async function guardar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const guardado = nuevo
        ? await crearLote({
            ...(id && { id }),
            codigo,
            ...(nombre.trim() && { nombre }),
            geom: geomNueva,
          })
        : await actualizarLote(lote.id, {
            codigo,
            nombre: nombre.trim() || null,
            ...(editandoForma && { geom: obtenerForma() }),
          })
      alGuardar(guardado)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  async function eliminar() {
    setEnviando(true)
    setError(null)
    try {
      await eliminarLote(lote.id)
      alEliminar(lote.id)
    } catch (e) {
      setError(mensajeDeError(e))
      setEnviando(false)
    }
  }

  return (
    <aside className="panel-lote" aria-label={nuevo ? 'Nuevo lote' : `Lote ${lote.codigo}`}>
      <form className="formulario" onSubmit={guardar}>
        <h2>{nuevo ? 'Nuevo lote' : `Lote ${lote.codigo}`}</h2>
        {lote && <p className="formulario__nota">Área: {formatoHa.format(lote.area_ha)} ha</p>}

        {advertencias.map((aviso) => (
          <p key={aviso} className="formulario__aviso" role="status">
            {aviso}
          </p>
        ))}

        <fieldset disabled={!editable || enviando}>
          <label htmlFor="codigo_lote">Código</label>
          <input
            id="codigo_lote"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            maxLength={20}
            placeholder="L-01"
            required
          />

          <label htmlFor="nombre_lote">Nombre (opcional)</label>
          <input
            id="nombre_lote"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={100}
          />
        </fieldset>

        {editandoForma && (
          <p className="formulario__nota">
            Arrastre los vértices en el mapa y luego guarde los cambios.
          </p>
        )}
        {error && (
          <p className="formulario__error" role="alert">
            {error}
          </p>
        )}

        <div className="formulario__acciones">
          <button type="button" className="boton-secundario" onClick={alCerrar}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </button>
          {editable && !nuevo && !editandoForma && (
            <button type="button" className="boton-secundario" onClick={alEditarForma}>
              Editar forma
            </button>
          )}
          {editable && (
            <button type="submit" className="boton-primario" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>

        {editable && !nuevo && (
          <div className="formulario__acciones formulario__peligro">
            {confirmarBorrado ? (
              <button type="button" className="boton-peligro" onClick={eliminar} disabled={enviando}>
                Confirmar: eliminar {lote.codigo}
              </button>
            ) : (
              <button
                type="button"
                className="boton-secundario"
                onClick={() => setConfirmarBorrado(true)}
              >
                Eliminar lote
              </button>
            )}
          </div>
        )}
      </form>
    </aside>
  )
}
