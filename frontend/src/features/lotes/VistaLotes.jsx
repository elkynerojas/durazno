import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import Encabezado from '../../components/Encabezado'
import MapaPredio from '../../components/MapaPredio'
import Plantilla from '../../components/Plantilla'
import { geojsonALeaflet, leafletAGeojson } from '../../utils/geo'
import { useSesion } from '../auth/useSesion'
import { usePredio } from '../predios/usePredio'
import { ROLES_GESTION } from '../usuarios/roles'
import { useDatosPredio } from '../mapa/useDatosPredio'
import CapaTrampas from '../trampas/CapaTrampas'
import CapaLotes from './CapaLotes'
import EditorPoligono from './EditorPoligono'
import FormularioLote from './FormularioLote'
import TablaLotes from './TablaLotes'

export default function VistaLotes() {
  const { usuario } = useSesion()
  const editable = ROLES_GESTION.includes(usuario.rol)
  const { predio } = usePredio()
  const datos = useDatosPredio(predio?.id)
  const [parametros, setParametros] = useSearchParams()
  const [mapa, setMapa] = useState(null)
  // Lote en edición (null: nuevo), polígono recién dibujado y avisos del último guardado.
  const [loteId, setLoteId] = useState(parametros.get('lote'))
  const [geomNueva, setGeomNueva] = useState(null)
  const [advertencias, setAdvertencias] = useState(null)
  const [dibujando, setDibujando] = useState(false)
  const [editandoForma, setEditandoForma] = useState(false)
  // Sube al cancelar una edición de forma para volver a pintar los polígonos guardados.
  const [version, setVersion] = useState(0)
  // Sube al cancelar para vaciar el formulario del lote nuevo.
  const [reinicio, setReinicio] = useState(0)
  const refCapas = useRef(new Map())

  const lote = datos.lotes.find((l) => l.id === loteId) ?? null

  // Al elegir un lote desde la tabla o desde otra página, el mapa lo encuadra (solo al cambiar
  // de lote o al terminar de cargar, no cada vez que se guarda).
  const geomLote = lote?.geom
  const encuadrado = useRef(null)
  useEffect(() => {
    if (!mapa || !geomLote || encuadrado.current === loteId) return
    encuadrado.current = loteId
    // La rejilla puede cambiar el tamaño del mapa después de montarlo.
    mapa.invalidateSize()
    mapa.fitBounds(geojsonALeaflet(geomLote)[0], { maxZoom: 18, padding: [40, 40] })
  }, [mapa, loteId, geomLote])

  function seleccionar(otro) {
    if (dibujando || editandoForma) return
    setLoteId(otro?.id ?? null)
    setGeomNueva(null)
    setAdvertencias(null)
    setParametros(otro ? { lote: otro.id } : {}, { replace: true })
  }

  function cancelar() {
    if (editandoForma) setVersion((v) => v + 1)
    setDibujando(false)
    setEditandoForma(false)
    setReinicio((r) => r + 1)
    seleccionar(null)
  }

  const alDibujar = useCallback((anillos) => setGeomNueva(leafletAGeojson(anillos)), [])
  const alTerminarDibujo = useCallback(() => setDibujando(false), [])

  function alGuardar({ advertencias: avisos, ...guardado }) {
    datos.guardarLote(guardado)
    setLoteId(guardado.id)
    setGeomNueva(null)
    setEditandoForma(false)
    setAdvertencias(avisos)
    setParametros({ lote: guardado.id }, { replace: true })
  }

  const titulo = lote ? `Lote ${lote.codigo}` : editable ? 'Nuevo lote' : 'Lotes'

  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: predio?.nombre ?? 'Predio', a: '/mapa' }, { texto: 'Lotes' }]}
        titulo={titulo}
      >
        {(lote || geomNueva || dibujando) && editable && (
          <button type="button" className="boton-secundario" onClick={cancelar}>
            {lote ? 'Nuevo lote' : 'Cancelar'}
          </button>
        )}
      </Encabezado>
      {datos.error && (
        <p className="formulario__error" role="alert">
          {datos.error}
        </p>
      )}

      <div className="rejilla rejilla--mapa">
        <section className="tarjeta tarjeta--sin-relleno" aria-label="Mapa de lotes">
          <div className="mapa-tarjeta__barra">
            {editable ? (
              <div className="grupo-botones">
                <button
                  type="button"
                  className="boton-secundario"
                  aria-pressed={dibujando}
                  disabled={Boolean(lote) || editandoForma}
                  onClick={() => {
                    setGeomNueva(null)
                    setDibujando((d) => !d)
                  }}
                >
                  {dibujando ? 'Dejar de dibujar' : 'Dibujar polígono'}
                </button>
                <button
                  type="button"
                  className="boton-secundario"
                  aria-pressed={editandoForma}
                  disabled={!lote || dibujando}
                  onClick={() => {
                    if (editandoForma) setVersion((v) => v + 1)
                    setEditandoForma((e) => !e)
                  }}
                >
                  {editandoForma ? 'Descartar vértices' : 'Editar vértices'}
                </button>
              </div>
            ) : (
              <span />
            )}
            <p className="mapa-tarjeta__ayuda">
              {dibujando
                ? 'Toque para agregar vértices · toque el primero para cerrar'
                : 'Toque un lote para ver sus datos'}
            </p>
          </div>
          <div className="mapa-tarjeta__lienzo">
            <MapaPredio ref={setMapa}>
              <CapaLotes
                lotes={datos.lotes}
                lotesIniciales={loteId ? null : datos.lotesIniciales}
                seleccionadoId={loteId}
                editandoId={editandoForma ? loteId : null}
                alSeleccionar={seleccionar}
                refCapas={refCapas}
                version={version}
              />
              <CapaTrampas trampas={datos.trampas} />
              {editable && (
                <EditorPoligono
                  dibujando={dibujando}
                  alDibujar={alDibujar}
                  alTerminar={alTerminarDibujo}
                />
              )}
            </MapaPredio>
          </div>
        </section>

        <section className="tarjeta">
          <FormularioLote
            predioId={predio.id}
            key={loteId ?? `nuevo-${reinicio}`}
            lote={lote}
            geomNueva={geomNueva}
            advertencias={advertencias}
            editable={editable}
            editandoForma={editandoForma}
            obtenerForma={() => leafletAGeojson(refCapas.current.get(loteId).getLatLngs())}
            alGuardar={alGuardar}
            alEliminar={(id) => {
              datos.quitarLote(id)
              seleccionar(null)
            }}
          />
        </section>
      </div>

      <TablaLotes
        lotes={datos.lotes}
        trampas={datos.trampas}
        seleccionadoId={loteId}
        alSeleccionar={seleccionar}
        editable={editable}
      />
    </Plantilla>
  )
}
