import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { actualizarRuta, crearRuta, listarRutas, proponerRuta } from '../../api/client'
import Encabezado from '../../components/Encabezado'
import MapaPredio from '../../components/MapaPredio'
import Plantilla from '../../components/Plantilla'
import { useSesion } from '../auth/useSesion'
import CapaLotes from '../lotes/CapaLotes'
import { useDatosPredio } from '../mapa/useDatosPredio'
import { usePredio } from '../predios/usePredio'
import { ROLES_GESTION } from '../usuarios/roles'
import CapaRuta from './CapaRuta'
import ListaParadas from './ListaParadas'
import { faltantes, ordenInicial, tramos } from './orden'

const metros = (m) => `${Math.round(m).toLocaleString('es-CO')} m`

function mensajeDeError(error) {
  if (typeof error.detalle === 'string') return error.detalle
  return 'No se pudo guardar la ruta. Intente de nuevo.'
}

// Rutas de monitoreo (HU-19): orden de visita de las trampas activas de cada lote.
export default function VistaRutas() {
  const { usuario } = useSesion()
  const editable = ROLES_GESTION.includes(usuario.rol)
  const { predio } = usePredio()
  const datos = useDatosPredio(predio.id)
  const [parametros, setParametros] = useSearchParams()
  const loteId = parametros.get('lote') ?? datos.lotes[0]?.id ?? null
  const lote = datos.lotes.find((l) => l.id === loteId)
  const activasDe = (id) => datos.trampas.filter((t) => t.lote_id === id && t.estado === 'activa')
  // Memorizadas: la ruta del lote las usa al cargar y no debe recargarse en cada render.
  const activas = useMemo(
    () => datos.trampas.filter((t) => t.lote_id === loteId && t.estado === 'activa'),
    [datos.trampas, loteId],
  )
  // Al proponer, la ruta del lote vuelve a montarse con la propuesta (sube la versión).
  const [propuestas, setPropuestas] = useState(0)

  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: predio.nombre, a: '/mapa' }, { texto: 'Rutas' }]}
        titulo={lote ? `Ruta de monitoreo · Lote ${lote.codigo}` : 'Rutas de monitoreo'}
      >
        {datos.lotes.length > 0 && (
          <div className="filtro-lote">
            <label htmlFor="lote_ruta">Lote</label>
            <select
              id="lote_ruta"
              value={loteId ?? ''}
              onChange={(e) => setParametros({ lote: e.target.value }, { replace: true })}
            >
              {datos.lotes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} · {activasDe(l.id).length} trampas
                </option>
              ))}
            </select>
          </div>
        )}
        {editable && lote && activas.length > 0 && (
          <button
            type="button"
            className="boton-secundario"
            onClick={() => setPropuestas((n) => n + 1)}
          >
            Ordenar por cercanía
          </button>
        )}
      </Encabezado>
      {datos.error && (
        <p className="formulario__error" role="alert">
          {datos.error}
        </p>
      )}
      {!datos.cargando && !lote && (
        <section className="tarjeta">
          <p>Registre los lotes del predio y sus trampas para definir las rutas.</p>
        </section>
      )}
      {!datos.cargando && lote && (
        <RutaDelLote
          key={`${lote.id}-${propuestas}`}
          lote={lote}
          activas={activas}
          proponer={propuestas > 0}
          editable={editable}
        />
      )}
    </Plantilla>
  )
}

function RutaDelLote({ lote, activas, proponer, editable }) {
  const [ruta, setRuta] = useState(undefined)
  const [orden, setOrden] = useState([])
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)
  const [ordenandoEnMapa, setOrdenandoEnMapa] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const refCapas = useRef(new Map())
  // El id se genera una sola vez: si el envío se repite, la API no duplica la ruta.
  const [id] = useState(() => globalThis.crypto?.randomUUID?.())

  useEffect(() => {
    let vigente = true
    async function cargar() {
      try {
        const [guardada] = await listarRutas(lote.id)
        if (!vigente) return
        setRuta(guardada ?? null)
        if (guardada && !proponer) {
          const inicial = ordenInicial(guardada, activas)
          setOrden(inicial.orden)
          const cambios = [
            inicial.quitadas.length && `se quitaron ${inicial.quitadas.join(', ')} (no activas)`,
            inicial.agregadas.length && `se agregaron al final ${inicial.agregadas.join(', ')}`,
          ].filter(Boolean)
          if (cambios.length) {
            setAviso(`Las trampas del lote cambiaron: ${cambios.join('; ')}. Revise y guarde.`)
          }
        } else if (activas.length > 0) {
          const propuesta = await proponerRuta(lote.id)
          if (!vigente) return
          setOrden(propuesta.paradas.map((p) => p.trampa_id))
          setAviso('Propuesta por cercanía (vecino más cercano). Ajústela y guárdela.')
        }
      } catch {
        if (vigente) setError('No se pudo cargar la ruta del lote.')
      }
    }
    cargar()
    return () => {
      vigente = false
    }
  }, [lote.id, activas, proponer])

  const porId = new Map(activas.map((t) => [t.id, t]))
  const guardado = ruta?.paradas.map((p) => p.trampa_id) ?? []
  const sinCambios = ruta && JSON.stringify(orden) === JSON.stringify(guardado)
  // Guardada, las distancias son las del servidor; mientras se edita, aproximadas.
  const aproximadas = tramos(
    orden.filter((t) => porId.has(t)),
    porId,
  )
  const distancias = sinCambios
    ? ruta.paradas.map((p) => p.distancia_desde_anterior_m)
    : aproximadas.distancias
  const total = sinCambios ? ruta.distancia_total_m : aproximadas.total
  const faltan = faltantes(orden, activas)
  const completa = activas.length > 0 && faltan.length === 0

  function cambiar(nuevo) {
    setOrden(nuevo)
    setAviso(null)
  }

  function alternarOrdenEnMapa() {
    if (!ordenandoEnMapa) cambiar([])
    setOrdenandoEnMapa((o) => !o)
  }

  function agregarDesdeMapa(trampaId) {
    const nuevo = [...orden, trampaId]
    cambiar(nuevo)
    if (nuevo.length === activas.length) setOrdenandoEnMapa(false)
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const guardada = ruta
        ? await actualizarRuta(ruta.id, orden)
        : await crearRuta({ ...(id && { id }), lote_id: lote.id, trampas: orden })
      setRuta(guardada)
      setOrden(guardada.paradas.map((p) => p.trampa_id))
      setAviso('Ruta guardada.')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rejilla rejilla--mapa">
      <section className="tarjeta tarjeta--sin-relleno" aria-label="Mapa de la ruta">
        {editable && activas.length > 0 && (
          <div className="mapa-tarjeta__barra">
            <button
              type="button"
              className="boton-secundario"
              aria-pressed={ordenandoEnMapa}
              onClick={alternarOrdenEnMapa}
            >
              {ordenandoEnMapa ? 'Terminar' : 'Ordenar en el mapa'}
            </button>
            <p className="mapa-tarjeta__ayuda">
              {ordenandoEnMapa
                ? `Toque las trampas en el orden de visita (${orden.length} de ${activas.length})`
                : 'Arrastre la lista o use las flechas para cambiar el orden'}
            </p>
          </div>
        )}
        <div className="mapa-tarjeta__lienzo">
          <MapaPredio>
            <CapaLotes
              lotes={[lote]}
              lotesIniciales={[lote]}
              alSeleccionar={() => {}}
              refCapas={refCapas}
              etiquetas={false}
            />
            <CapaRuta
              orden={orden.filter((t) => porId.has(t))}
              trampas={activas}
              alTocar={ordenandoEnMapa ? agregarDesdeMapa : undefined}
            />
          </MapaPredio>
        </div>
        <p className="mapa-tarjeta__leyenda" aria-live="polite">
          <span>
            Recorrido: <strong>{sinCambios ? metros(total) : `≈ ${metros(total)}`}</strong>
          </span>
          <span>
            Paradas: <strong>{orden.length}</strong> de {activas.length}
          </span>
        </p>
      </section>

      <div className="columna">
        <section className="tarjeta" aria-labelledby="titulo-orden">
          <div className="ficha__encabezado">
            <h2 id="titulo-orden" className="tarjeta__titulo">
              Orden de visita
            </h2>
            {editable && orden.length > 1 && (
              <span className="formulario__nota">Arrastre para reordenar</span>
            )}
          </div>
          {activas.length === 0 ? (
            <p className="formulario__nota">El lote no tiene trampas activas.</p>
          ) : (
            <ListaParadas
              paradas={orden
                .filter((t) => porId.has(t))
                .map((t, i) => ({ trampa: porId.get(t), distancia: distancias[i] }))}
              editable={editable && !ordenandoEnMapa}
              alCambiar={cambiar}
            />
          )}
        </section>

        {activas.length > 0 &&
          (completa ? (
            <p className="formulario__exito" role="status">
              La ruta incluye las {activas.length} trampas activas del lote, sin omisiones ni
              duplicados.
            </p>
          ) : (
            <p className="formulario__aviso" role="status">
              Faltan {faltan.length} de {activas.length} trampas:{' '}
              {faltan.map((t) => t.codigo_ica).join(', ')}.
            </p>
          ))}
        {aviso && (
          <p className="formulario__nota" role="status">
            {aviso}
          </p>
        )}
        {error && (
          <p className="formulario__error" role="alert">
            {error}
          </p>
        )}
        {ruta === null && !editable && (
          <p className="formulario__nota">El agrónomo aún no ha definido la ruta de este lote.</p>
        )}
        {editable && activas.length > 0 && (
          <div className="formulario__acciones formulario__acciones--inicio">
            <button
              type="button"
              className="boton-primario"
              disabled={!completa || sinCambios || guardando || ordenandoEnMapa}
              onClick={guardar}
            >
              {guardando ? 'Guardando…' : 'Guardar ruta'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
