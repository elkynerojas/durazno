import { useState } from 'react'

import { actualizarPredio, crearPredio } from '../../api/client'
import { formatoHa } from '../../utils/formato'
import { areaAproximadaHa, mismaGeometria } from '../../utils/geo'
import { COLOR_LIMITE } from '../mapa/colores'

const VACIO = {
  nombre: '',
  vereda: '',
  municipio: 'Cácota',
  registro_ica: '',
  area_ha: '',
  color_limite: null,
}

function aFormulario(predio) {
  if (!predio) return VACIO
  const { nombre, vereda, municipio, registro_ica, area_ha, color_limite } = predio
  return {
    nombre,
    vereda,
    municipio,
    registro_ica: registro_ica ?? '',
    area_ha: String(area_ha),
    color_limite: color_limite ?? null,
  }
}

// Datos de un predio. Sin `predio` crea uno nuevo (administrador); con `predio` lo actualiza.
// `limite`: límite a enviar si se dibujó uno nuevo (`null` lo quita; sin la prop, se conserva el
// actual). `obtenerLimite`: lo lee del mapa al guardar, si se están editando los vértices.
// `alCambiarColor` avisa el color del límite elegido para previsualizarlo en el mapa.
export default function FormularioPredio({
  predio,
  limite,
  obtenerLimite,
  editable,
  alCambiarColor,
  alGuardar,
  alCancelar,
}) {
  const nuevo = !predio
  // El id se genera una sola vez: si el registro se reenvía, la API no duplica el predio.
  const [id] = useState(() => globalThis.crypto?.randomUUID?.())
  const [datos, setDatos] = useState(() => aFormulario(predio))
  const [estado, setEstado] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const cambiar = (campo) => (evento) =>
    setDatos((previos) => ({ ...previos, [campo]: evento.target.value }))

  function cambiarColor(color) {
    setDatos((previos) => ({ ...previos, color_limite: color }))
    alCambiarColor?.(color)
  }

  const limiteActual = limite !== undefined ? limite : (predio?.limite ?? null)
  // Con límite, el área la calcula el servidor: aquí solo se muestra (aproximada si cambió).
  const areaDelLimite = !limiteActual
    ? null
    : mismaGeometria(limiteActual, predio?.limite)
      ? `${formatoHa.format(predio.area_ha)} ha`
      : `≈ ${formatoHa.format(areaAproximadaHa(limiteActual))} ha`

  async function enviar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setEstado(null)
    // PUT reemplaza todo: se reenvía el límite (el actual si no cambió) para no borrarlo.
    const limiteEnviado = obtenerLimite ? obtenerLimite() : limiteActual
    const { area_ha, ...resto } = datos
    const cuerpo = {
      ...resto,
      registro_ica: datos.registro_ica.trim() || null,
      ...(!limiteEnviado && { area_ha: Number(area_ha) }),
      limite: limiteEnviado,
    }
    try {
      const guardado = nuevo
        ? await crearPredio({ ...(id && { id }), ...cuerpo })
        : await actualizarPredio(predio.id, cuerpo)
      setEstado({
        exito: nuevo ? 'Predio creado.' : 'Datos del predio guardados.',
        advertencias: guardado.advertencias ?? [],
      })
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
            {areaDelLimite ? (
              <input id="area_ha" value={areaDelLimite} readOnly />
            ) : (
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
            )}
          </div>
        </div>
        {limiteActual && (
          <>
            <label htmlFor="color_limite">Color del límite en el mapa</label>
            <div className="selector-color">
              <input
                id="color_limite"
                type="color"
                value={datos.color_limite ?? COLOR_LIMITE}
                onChange={(e) => cambiarColor(e.target.value)}
              />
              {datos.color_limite && (
                <button type="button" className="enlace" onClick={() => cambiarColor(null)}>
                  Usar el color por defecto
                </button>
              )}
            </div>
          </>
        )}
      </fieldset>

      <p className="formulario__nota">
        {limiteActual
          ? 'El área se calcula del límite dibujado.'
          : 'Sin límite dibujado: escriba el área o dibuje el límite en el mapa.'}
      </p>
      {estado?.advertencias?.map((aviso) => (
        <p key={aviso} className="formulario__aviso" role="status">
          {aviso}
        </p>
      ))}
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
