import { useState } from 'react'

import { programarActividad } from '../../api/client'
import { rangoSemana, semanaDelAnio, semanasDelAnio } from '../../utils/fechas'
import { TIPOS_TRAMPA } from '../trampas/catalogo'
import { LABORES, TIPOS_ACTIVIDAD } from './catalogo'

function mensajeDeError(error) {
  if (typeof error.detalle === 'string') return error.detalle
  if (error.estado === 422) return 'Revise los datos de la actividad.'
  return 'No se pudo programar la actividad. Intente de nuevo.'
}

// «Programar actividad» (HU-21). `lotesConRuta`: ids de los lotes con ruta (las visitas de
// monitoreo la necesitan). `personal`: responsables posibles (técnicos y agrónomos).
export default function FormularioActividad({
  anio,
  semanaInicial,
  lotes,
  lotesConRuta,
  personal,
  loteInicial,
  alGuardar,
  alCancelar,
}) {
  // El id se genera una sola vez: si el envío se repite, la API no duplica la serie.
  const [id] = useState(() => globalThis.crypto?.randomUUID?.())
  const totalSemanas = semanasDelAnio(anio)
  const [datos, setDatos] = useState({
    tipo: 'visita_monitoreo',
    labor: 'poda',
    tipo_trampa: 'jackson',
    lote_id: loteInicial ?? lotes[0]?.id ?? '',
    semana: String(semanaInicial),
    responsable_id: personal[0]?.id ?? '',
    notas: '',
    repetir: false,
    cada_semanas: '1',
    hasta_semana: String(totalSemanas),
  })
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const cambiar = (campo) => (evento) => {
    const { type, checked, value } = evento.target
    setDatos((previos) => ({ ...previos, [campo]: type === 'checkbox' ? checked : value }))
  }

  const semana = Number(datos.semana)
  const semanaValida = Number.isInteger(semana) && semana >= 1 && semana <= totalSemanas
  const sinRuta = datos.tipo === 'visita_monitoreo' && !lotesConRuta.has(datos.lote_id)

  async function guardar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const creadas = await programarActividad({
        ...(id && { id }),
        lote_id: datos.lote_id,
        tipo: datos.tipo,
        ...(datos.tipo === 'labor_cultural' && { labor: datos.labor }),
        ...(datos.tipo === 'cambio_atrayente' && { tipo_trampa: datos.tipo_trampa }),
        anio,
        semana,
        responsable_id: datos.responsable_id,
        ...(datos.notas.trim() && { notas: datos.notas }),
        ...(datos.repetir && {
          repetir: {
            cada_semanas: Number(datos.cada_semanas),
            hasta_semana: Number(datos.hasta_semana),
          },
        }),
      })
      alGuardar(creadas)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={guardar} aria-label="Programar actividad">
      <h2>Programar actividad {anio}</h2>
      <fieldset disabled={enviando}>
        <p className="etiqueta" id="tipo_actividad">
          Tipo de actividad
        </p>
        <div role="radiogroup" aria-labelledby="tipo_actividad">
          {Object.entries(TIPOS_ACTIVIDAD).map(([valor, nombre]) => (
            <label key={valor} className="opcion">
              <input
                type="radio"
                name="tipo"
                value={valor}
                checked={datos.tipo === valor}
                onChange={cambiar('tipo')}
              />
              <span>
                <strong>{nombre}</strong>
              </span>
            </label>
          ))}
        </div>

        {datos.tipo === 'labor_cultural' && (
          <>
            <label htmlFor="labor">Labor</label>
            <select id="labor" value={datos.labor} onChange={cambiar('labor')}>
              {Object.entries(LABORES).map(([valor, nombre]) => (
                <option key={valor} value={valor}>
                  {nombre}
                </option>
              ))}
            </select>
          </>
        )}
        {datos.tipo === 'cambio_atrayente' && (
          <>
            <label htmlFor="tipo_trampa_plan">Trampas</label>
            <select
              id="tipo_trampa_plan"
              value={datos.tipo_trampa}
              onChange={cambiar('tipo_trampa')}
            >
              {Object.entries(TIPOS_TRAMPA).map(([valor, t]) => (
                <option key={valor} value={valor}>
                  {t.nombre} · {t.atrayente.toLowerCase()}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="formulario__fila">
          <div>
            <label htmlFor="lote_plan">Lote</label>
            <select id="lote_plan" value={datos.lote_id} onChange={cambiar('lote_id')} required>
              {lotes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo}
                  {l.nombre ? ` · ${l.nombre}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="semana_plan">Semana</label>
            <input
              id="semana_plan"
              type="number"
              inputMode="numeric"
              min="1"
              max={totalSemanas}
              value={datos.semana}
              onChange={cambiar('semana')}
              required
            />
          </div>
        </div>
        {semanaValida && (
          <p className="formulario__nota">{rangoSemana(semanaDelAnio(anio, semana))}</p>
        )}
        {sinRuta && (
          <p className="formulario__aviso" role="status">
            Este lote no tiene ruta: defínala en «Rutas de monitoreo» antes de programar visitas.
          </p>
        )}

        <label htmlFor="responsable_plan">Responsable</label>
        <select
          id="responsable_plan"
          value={datos.responsable_id}
          onChange={cambiar('responsable_id')}
          required
        >
          {personal.length === 0 && <option value="">Sin personal asignado al predio</option>}
          {personal.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre_completo} · {p.rol === 'tecnico' ? 'técnico' : 'agrónomo'}
            </option>
          ))}
        </select>

        <label className="formulario__casilla">
          <input type="checkbox" checked={datos.repetir} onChange={cambiar('repetir')} />
          Repetir
        </label>
        {datos.repetir && (
          <div className="formulario__fila">
            <div>
              <label htmlFor="cada_semanas">Cada (semanas)</label>
              <input
                id="cada_semanas"
                type="number"
                inputMode="numeric"
                min="1"
                max="26"
                value={datos.cada_semanas}
                onChange={cambiar('cada_semanas')}
                required
              />
            </div>
            <div>
              <label htmlFor="hasta_semana">Hasta la semana</label>
              <input
                id="hasta_semana"
                type="number"
                inputMode="numeric"
                min={semanaValida ? semana : 1}
                max={totalSemanas}
                value={datos.hasta_semana}
                onChange={cambiar('hasta_semana')}
                required
              />
            </div>
          </div>
        )}

        <label htmlFor="notas_plan">Notas</label>
        <input
          id="notas_plan"
          value={datos.notas}
          onChange={cambiar('notas')}
          maxLength={300}
          placeholder="Opcional"
        />
      </fieldset>

      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      <div className="formulario__acciones">
        <button type="button" className="boton-secundario" onClick={alCancelar}>
          Cancelar
        </button>
        <button
          type="submit"
          className="boton-primario"
          disabled={enviando || sinRuta || !datos.responsable_id || !datos.lote_id}
        >
          {enviando ? 'Programando…' : 'Programar'}
        </button>
      </div>
    </form>
  )
}
