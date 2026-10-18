import { useCallback, useEffect, useRef, useState } from 'react'
import { Polygon } from 'react-leaflet'

import Encabezado from '../../components/Encabezado'
import MapaPredio from '../../components/MapaPredio'
import Plantilla from '../../components/Plantilla'
import { geojsonALeaflet, leafletAGeojson, mismaGeometria } from '../../utils/geo'
import { useSesion } from '../auth/useSesion'
import CapaLotes from '../lotes/CapaLotes'
import EditorPoligono from '../lotes/EditorPoligono'
import { useDatosPredio } from '../mapa/useDatosPredio'
import FormularioPredio from '../predios/FormularioPredio'
import { usePredio } from '../predios/usePredio'
import { ROLES_GESTION } from '../usuarios/roles'

const ESTILO_LIMITE = {
  color: '#17322a',
  weight: 3,
  dashArray: '10 6',
  fillColor: '#e8875a',
  fillOpacity: 0.08,
}

// Datos del predio actual y su límite (polígono). El agrónomo asignado o el administrador los
// editan; con límite, el área la calcula el servidor.
export default function VistaPredio() {
  const { usuario } = useSesion()
  const { predio, recargar } = usePredio()
  const editable = ROLES_GESTION.includes(usuario.rol)
  const datos = useDatosPredio(predio.id)
  const [mapa, setMapa] = useState(null)
  // Límite pendiente de guardar (GeoJSON o null si se quitó).
  const [limite, setLimite] = useState(predio.limite)
  const [dibujando, setDibujando] = useState(false)
  const [editando, setEditando] = useState(false)
  // Sube para volver a pintar el polígono (tras dibujar o guardar).
  const [version, setVersion] = useState(0)
  const refLimite = useRef(null)
  const refCapas = useRef(new Map())

  // Encuadra el límite al abrir; sin límite, CapaLotes encuadra los lotes.
  const encuadrado = useRef(false)
  useEffect(() => {
    if (!mapa || !predio.limite || encuadrado.current) return
    encuadrado.current = true
    mapa.fitBounds(geojsonALeaflet(predio.limite)[0], { padding: [24, 24], maxZoom: 17 })
  }, [mapa, predio.limite])

  useEffect(() => {
    const capa = editando && refLimite.current
    if (!capa) return
    capa.pm.enable({ allowSelfIntersection: false })
    return () => capa.pm.disable()
  }, [editando, version])

  const leerLimite = () => leafletAGeojson(refLimite.current.getLatLngs())

  const alDibujar = useCallback((anillos) => {
    setLimite(leafletAGeojson(anillos))
    setVersion((v) => v + 1)
  }, [])
  const alTerminarDibujo = useCallback(() => setDibujando(false), [])

  function alternarEdicion() {
    if (editando) setLimite(leerLimite())
    setEditando((e) => !e)
  }

  function alGuardar(guardado) {
    setLimite(guardado.limite)
    setEditando(false)
    setVersion((v) => v + 1)
    recargar()
  }

  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: predio.nombre, a: '/mapa' }, { texto: 'Datos del predio' }]}
        titulo="Datos del predio"
      />
      <div className="rejilla rejilla--mapa">
        <section className="tarjeta tarjeta--sin-relleno" aria-label="Límite del predio">
          <div className="mapa-tarjeta__barra">
            {editable ? (
              <div className="grupo-botones">
                {!limite && (
                  <button
                    type="button"
                    className="boton-secundario"
                    aria-pressed={dibujando}
                    onClick={() => setDibujando((d) => !d)}
                  >
                    {dibujando ? 'Dejar de dibujar' : 'Dibujar límite'}
                  </button>
                )}
                {limite && (
                  <>
                    <button
                      type="button"
                      className="boton-secundario"
                      aria-pressed={editando}
                      onClick={alternarEdicion}
                    >
                      {editando ? 'Terminar edición' : 'Editar vértices'}
                    </button>
                    <button
                      type="button"
                      className="boton-secundario"
                      onClick={() => {
                        setEditando(false)
                        setLimite(null)
                      }}
                    >
                      Quitar límite
                    </button>
                  </>
                )}
              </div>
            ) : (
              <strong>Límite del predio</strong>
            )}
            <p className="mapa-tarjeta__ayuda">
              {dibujando
                ? 'Toque para agregar vértices · toque el primero para cerrar'
                : !mismaGeometria(limite, predio.limite)
                  ? 'Cambios sin guardar: use «Guardar» en los datos del predio'
                  : 'Los lotes del predio aparecen como referencia'}
            </p>
          </div>
          <div className="mapa-tarjeta__lienzo">
            <MapaPredio ref={setMapa}>
              <CapaLotes
                lotes={datos.lotes}
                lotesIniciales={predio.limite ? null : datos.lotesIniciales}
                alSeleccionar={() => {}}
                refCapas={refCapas}
              />
              {limite && (
                <Polygon
                  key={version}
                  ref={refLimite}
                  positions={geojsonALeaflet(limite)}
                  pathOptions={ESTILO_LIMITE}
                />
              )}
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
          <FormularioPredio
            predio={predio}
            limite={limite}
            obtenerLimite={editando ? leerLimite : undefined}
            editable={editable}
            alGuardar={alGuardar}
          />
        </section>
      </div>
    </Plantilla>
  )
}
