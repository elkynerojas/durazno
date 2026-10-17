import { useEffect, useState } from 'react'

import { guardarPredio, obtenerPredio } from '../../api/client'
import Encabezado from '../../components/Encabezado'
import Plantilla from '../../components/Plantilla'
import { useSesion } from '../auth/useSesion'

const VACIO = { nombre: '', vereda: 'Icota', municipio: 'Cácota', registro_ica: '', area_ha: '' }

function aFormulario(predio) {
  if (!predio) return VACIO
  const { nombre, vereda, municipio, registro_ica, area_ha } = predio
  return { nombre, vereda, municipio, registro_ica: registro_ica ?? '', area_ha: String(area_ha) }
}

export default function VistaPredio() {
  const { usuario } = useSesion()
  const editable = usuario.rol === 'agronomo'
  // undefined: cargando; null: sin registrar; objeto: predio guardado.
  const [predio, setPredio] = useState(undefined)
  const [datos, setDatos] = useState(VACIO)
  // El id se genera una sola vez: si el primer registro se reenvía, la API no lo duplica.
  const [id] = useState(() => globalThis.crypto?.randomUUID?.())
  const [estado, setEstado] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    obtenerPredio()
      .then((p) => {
        setPredio(p)
        setDatos(aFormulario(p))
      })
      .catch((e) => {
        if (e.estado === 404) setPredio(null)
        else setEstado({ error: 'No se pudieron cargar los datos del predio.' })
      })
  }, [])

  const cambiar = (campo) => (evento) =>
    setDatos((previos) => ({ ...previos, [campo]: evento.target.value }))

  async function enviar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setEstado(null)
    try {
      const guardado = await guardarPredio({
        ...(!predio && id && { id }),
        ...datos,
        registro_ica: datos.registro_ica.trim() || null,
        area_ha: Number(datos.area_ha),
        // PUT reemplaza todo: se reenvía el límite que ya tenía para no borrarlo.
        limite: predio?.limite ?? null,
      })
      setPredio(guardado)
      setDatos(aFormulario(guardado))
      setEstado({ exito: 'Datos del predio guardados.' })
    } catch (e) {
      setEstado({
        error: e.estado === 422 ? 'Revise los datos del formulario.' : 'No se pudo guardar.',
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: 'Predio Icota', a: '/mapa' }, { texto: 'Predio' }]}
        titulo={predio === null && editable ? 'Registrar el predio' : 'Datos del predio'}
      />
      <div className="contenido-angosto">
        {predio === undefined && !estado && <p className="cargando">Cargando…</p>}
        {predio === null && !editable && (
          <p className="cargando">El agrónomo aún no ha registrado el predio.</p>
        )}
        {(predio || (predio === null && editable)) && (
          <form className="formulario tarjeta" onSubmit={enviar}>
            <h2>Identificación ante el ICA</h2>
            <fieldset disabled={!editable || enviando}>
              <label htmlFor="nombre_predio">Nombre</label>
              <input
                id="nombre_predio"
                value={datos.nombre}
                onChange={cambiar('nombre')}
                maxLength={150}
                required
              />

              <label htmlFor="vereda">Vereda</label>
              <input
                id="vereda"
                value={datos.vereda}
                onChange={cambiar('vereda')}
                maxLength={100}
                required
              />

              <label htmlFor="municipio">Municipio</label>
              <input
                id="municipio"
                value={datos.municipio}
                onChange={cambiar('municipio')}
                maxLength={100}
                required
              />

              <label htmlFor="registro_ica">Registro ICA del predio</label>
              <input
                id="registro_ica"
                value={datos.registro_ica}
                onChange={cambiar('registro_ica')}
                maxLength={50}
              />

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
                <button type="submit" className="boton-primario" disabled={enviando}>
                  {enviando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            )}
          </form>
        )}
        {predio === undefined && estado?.error && (
          <p className="formulario__error" role="alert">
            {estado.error}
          </p>
        )}
      </div>
    </Plantilla>
  )
}
