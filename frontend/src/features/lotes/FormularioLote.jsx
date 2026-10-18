import { useState } from 'react'

import { actualizarLote, crearLote, eliminarLote } from '../../api/client'
import { formatoHa } from '../../utils/formato'
import { areaAproximadaHa, contarVertices } from '../../utils/geo'
import { COLOR_LOTE } from '../mapa/colores'

function mensajeDeError(error) {
  if (typeof error.detalle === 'string') return error.detalle
  if (error.estado === 422) return 'Revise los datos del lote.'
  return 'No se pudo guardar. Intente de nuevo.'
}

// «Datos del lote». Sin `lote` registra uno nuevo con `geomNueva` (dibujada en el mapa).
// `advertencias` (o null) viene del último guardado; `obtenerForma` da el polígono editado.
// `alCambiarColor` avisa el color elegido para previsualizarlo en el mapa.
export default function FormularioLote({
  predioId,
  lote,
  geomNueva,
  advertencias = null,
  editable,
  editandoForma = false,
  obtenerForma,
  alCambiarColor,
  alGuardar,
  alEliminar,
}) {
  const nuevo = !lote
  // El id se genera una sola vez: si el envío se repite, la API no duplica el lote.
  const [id] = useState(() => globalThis.crypto?.randomUUID?.())
  const [codigo, setCodigo] = useState(lote?.codigo ?? '')
  const [nombre, setNombre] = useState(lote?.nombre ?? '')
  // null: el color por defecto de la aplicación.
  const [color, setColor] = useState(lote?.color ?? null)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  const area = geomNueva
    ? `≈ ${formatoHa.format(areaAproximadaHa(geomNueva))} ha`
    : lote
      ? `${formatoHa.format(lote.area_ha)} ha`
      : ''

  async function guardar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const guardado = nuevo
        ? await crearLote({
            ...(id && { id }),
            predio_id: predioId,
            codigo,
            ...(nombre.trim() && { nombre }),
            ...(color && { color }),
            geom: geomNueva,
          })
        : await actualizarLote(lote.id, {
            codigo,
            nombre: nombre.trim() || null,
            color,
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
    <form className="formulario" onSubmit={guardar} aria-label="Datos del lote">
      <h2>Datos del lote</h2>
      <fieldset disabled={!editable || enviando}>
        <div className="formulario__fila">
          <div>
            <label htmlFor="codigo_lote">Código</label>
            <input
              id="codigo_lote"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              maxLength={20}
              placeholder="L-01"
              required
            />
          </div>
          <div>
            <label htmlFor="area_lote">Área calculada</label>
            <input id="area_lote" value={area} placeholder="Al dibujar" readOnly />
          </div>
        </div>

        <label htmlFor="nombre_lote">Nombre o referencia</label>
        <input
          id="nombre_lote"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={100}
          placeholder="Ej. Lote alto junto a la quebrada"
        />

        <label htmlFor="color_lote">Color en el mapa</label>
        <div className="selector-color">
          <input
            id="color_lote"
            type="color"
            value={color ?? COLOR_LOTE}
            onChange={(e) => {
              setColor(e.target.value)
              alCambiarColor?.(e.target.value)
            }}
          />
          {color && (
            <button
              type="button"
              className="enlace"
              onClick={() => {
                setColor(null)
                alCambiarColor?.(null)
              }}
            >
              Usar el color por defecto
            </button>
          )}
        </div>
      </fieldset>

      {editable && nuevo && !geomNueva && (
        <p className="formulario__nota">
          Use «Dibujar polígono» y toque el primer vértice para cerrarlo.
        </p>
      )}
      {geomNueva && (
        <p className="formulario__exito" role="status">
          Polígono cerrado con {contarVertices(geomNueva)} vértices. Al guardar, el servidor valida
          que no se cruce, calcula el área y revisa traslapes.
        </p>
      )}
      {editandoForma && (
        <p className="formulario__nota">Arrastre los vértices en el mapa y guarde los cambios.</p>
      )}
      {advertencias?.map((aviso) => (
        <p key={aviso} className="formulario__aviso" role="status">
          {aviso}
        </p>
      ))}
      {advertencias?.length === 0 && (
        <p className="formulario__exito" role="status">
          Polígono válido. No se superpone con otros lotes.
        </p>
      )}
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}

      {editable && (
        <button
          type="submit"
          className="boton-primario boton-bloque"
          disabled={enviando || (nuevo && !geomNueva)}
        >
          {enviando ? 'Guardando…' : nuevo ? 'Guardar lote' : 'Guardar cambios'}
        </button>
      )}

      {editable && !nuevo && (
        <div className="formulario__acciones formulario__acciones--inicio formulario__peligro">
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
  )
}
