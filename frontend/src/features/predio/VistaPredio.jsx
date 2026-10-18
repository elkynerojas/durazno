import { useCallback, useEffect, useRef, useState } from 'react'
import { Polygon } from 'react-leaflet'

import Encabezado from '../../components/Encabezado'
import MapaPredio from '../../components/MapaPredio'
import Plantilla from '../../components/Plantilla'
import { geojsonALeaflet, leafletAGeojson, mismaGeometria } from '../../utils/geo'
import { useSesion } from '../auth/useSesion'
import CapaLotes from '../lotes/CapaLotes'
import { estiloLimite } from '../mapa/colores'
import EditorPoligono from '../lotes/EditorPoligono'
import { useDatosPredio } from '../mapa/useDatosPredio'
import AdministrarPredios from '../predios/AdministrarPredios'
import FormularioPredio from '../predios/FormularioPredio'
import PersonalPredio from '../predios/PersonalPredio'
import SinPredio from '../predios/SinPredio'
import { usePredio } from '../predios/usePredio'
import { ROLES_GESTION } from '../usuarios/roles'

// En esta vista el límite se edita: con relleno tenue e interactivo para Geoman.
const estiloEditable = (color) => ({
  ...estiloLimite(color),
  fill: true,
  fillOpacity: 0.08,
  interactive: true,
})

// «Predio»: datos y límite del predio actual (todos los roles; los edita el agrónomo asignado o
// el administrador) y, para el administrador, su personal y la lista de todos los predios.
export default function VistaPredio() {
  const { usuario } = useSesion()
  const { predio, cargando } = usePredio()
  const administrador = usuario.rol === 'administrador'
  return (
    <Plantilla>
      <Encabezado migas={predio ? [{ texto: predio.nombre, a: '/mapa' }] : []} titulo="Predio" />
      {predio ? (
        // Al cambiar de predio se vuelve a montar: estado limpio y mapa encuadrado en el nuevo.
        <div key={predio.id} className="rejilla">
          <PredioActual editable={ROLES_GESTION.includes(usuario.rol)} />
          {administrador && (
            <section className="tarjeta">
              <PersonalPredio predio={predio} />
            </section>
          )}
        </div>
      ) : (
        (!administrador || cargando) && <SinPredio />
      )}
      {administrador && !cargando && <AdministrarPredios />}
    </Plantilla>
  )
}

// Límite (polígono) y datos del predio actual; con límite, el área la calcula el servidor.
function PredioActual({ editable }) {
  const { predio, recargar } = usePredio()
  const datos = useDatosPredio(predio.id)
  const [mapa, setMapa] = useState(null)
  // Límite pendiente de guardar (GeoJSON o null si se quitó).
  const [limite, setLimite] = useState(predio.limite)
  // Color del límite elegido en el formulario (undefined: el guardado).
  const [colorPrevio, setColorPrevio] = useState(undefined)
  const color = colorPrevio !== undefined ? colorPrevio : predio.color_limite
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
    setColorPrevio(undefined)
    setVersion((v) => v + 1)
    recargar()
  }

  return (
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
                pathOptions={estiloEditable(color)}
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
          alCambiarColor={setColorPrevio}
          alGuardar={alGuardar}
        />
      </section>
    </div>
  )
}
