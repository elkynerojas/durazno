import { useRef, useState } from 'react'
import { Link } from 'react-router'

import Encabezado from '../../components/Encabezado'
import MapaPredio from '../../components/MapaPredio'
import Plantilla from '../../components/Plantilla'
import { fechaCorta } from '../../utils/fechas'
import { formatoCoordenada, formatoHa } from '../../utils/formato'
import { puntoALeaflet } from '../../utils/geo'
import { useSesion } from '../auth/useSesion'
import CapaLotes from '../lotes/CapaLotes'
import BotonEtiquetas from '../trampas/BotonEtiquetas'
import CapaTrampas from '../trampas/CapaTrampas'
import { ESTADOS_TRAMPA, TIPOS_TRAMPA } from '../trampas/catalogo'
import { useDatosPredio } from './useDatosPredio'

// Vista general del predio: indicadores, mapa de consulta y ficha de lo seleccionado.
export default function VistaMapa() {
  const { usuario } = useSesion()
  const editable = usuario.rol === 'agronomo'
  const datos = useDatosPredio()
  const [capas, setCapas] = useState({ lotes: true, trampas: true })
  // { lote } o { trampa } seleccionado en el mapa.
  const [seleccion, setSeleccion] = useState(null)
  const refCapas = useRef(new Map())

  const activas = datos.trampas.filter((t) => t.estado === 'activa')
  const porTipo = (tipo) => activas.filter((t) => t.tipo === tipo).length
  const areaTotal = datos.lotes.reduce((suma, l) => suma + l.area_ha, 0)
  const noActivas = datos.trampas.length - activas.length

  const alternar = (capa) => setCapas((c) => ({ ...c, [capa]: !c[capa] }))

  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: 'Predio Icota · vereda Icota, Cácota (N. de S.)' }]}
        titulo="Mapa del predio"
      >
        {editable && (
          <>
            <Link to="/trampas" className="boton-secundario">
              Registrar trampa
            </Link>
            <Link to="/lotes" className="boton-primario">
              + Nuevo lote
            </Link>
          </>
        )}
      </Encabezado>
      {datos.error && (
        <p className="formulario__error" role="alert">
          {datos.error}
        </p>
      )}

      <div className="indicadores">
        <Indicador
          etiqueta="Lotes registrados"
          valor={datos.lotes.length}
          detalle={`${formatoHa.format(areaTotal)} ha delimitadas`}
        />
        <Indicador
          etiqueta="Trampas activas"
          valor={activas.length}
          detalle={`${porTipo('jackson')} Jackson · ${porTipo('mcphail')} McPhail`}
        />
        <Indicador
          etiqueta="Trampas inactivas o retiradas"
          valor={noActivas}
          detalle={`${datos.trampas.length} trampas registradas en total`}
        />
      </div>

      <div className="rejilla rejilla--mapa">
        <section className="tarjeta tarjeta--sin-relleno" aria-label="Mapa">
          <div className="mapa-tarjeta__barra">
            <div className="grupo-botones" role="group" aria-label="Capas">
              {[
                ['lotes', 'Lotes'],
                ['trampas', 'Trampas'],
              ].map(([clave, texto]) => (
                <button
                  key={clave}
                  type="button"
                  className="boton-secundario"
                  aria-pressed={capas[clave]}
                  onClick={() => alternar(clave)}
                >
                  {texto}
                </button>
              ))}
            </div>
            <p className="mapa-tarjeta__ayuda">Toque un lote o una trampa para ver su ficha</p>
          </div>
          <div className="mapa-tarjeta__lienzo">
            <MapaPredio>
              {capas.lotes && (
                <CapaLotes
                  lotes={datos.lotes}
                  lotesIniciales={datos.lotesIniciales}
                  seleccionadoId={seleccion?.lote?.id}
                  alSeleccionar={(lote) => setSeleccion({ lote })}
                  refCapas={refCapas}
                />
              )}
              {capas.trampas && (
                <CapaTrampas
                  trampas={datos.trampas}
                  seleccionadaId={seleccion?.trampa?.id}
                  alSeleccionar={(trampa) => setSeleccion({ trampa })}
                />
              )}
            </MapaPredio>
          </div>
          <div className="mapa-tarjeta__leyenda">
            <span>
              <i className="leyenda__muestra leyenda__muestra--lote" />
              Lote
            </span>
            <span>
              <i className="leyenda__muestra leyenda__muestra--circulo" />
              Jackson
            </span>
            <span>
              <i className="leyenda__muestra" />
              McPhail
            </span>
            <span>
              <i className="leyenda__muestra leyenda__muestra--circulo leyenda__muestra--inactiva" />
              Inactiva
            </span>
            <span>
              <i className="leyenda__muestra leyenda__muestra--circulo leyenda__muestra--retirada" />
              Retirada
            </span>
          </div>
        </section>

        <div className="columna">
          {seleccion?.trampa && (
            <FichaTrampa
              trampa={seleccion.trampa}
              lote={datos.lotes.find((l) => l.id === seleccion.trampa.lote_id)}
            />
          )}
          {seleccion?.lote && (
            <FichaLote
              lote={seleccion.lote}
              trampas={datos.trampas.filter((t) => t.lote_id === seleccion.lote.id)}
              editable={editable}
            />
          )}
          {!seleccion && (
            <section className="tarjeta">
              <p className="ficha__antetitulo">Ficha</p>
              <p>Seleccione un lote o una trampa en el mapa para ver sus datos.</p>
            </section>
          )}
          <ResumenLotes lotes={datos.lotes} trampas={datos.trampas} />
        </div>
      </div>
    </Plantilla>
  )
}

function Indicador({ etiqueta, valor, detalle }) {
  return (
    <section className="tarjeta">
      <p className="indicador__etiqueta">{etiqueta}</p>
      <p className="indicador__valor">{valor}</p>
      <p className="indicador__detalle">{detalle}</p>
    </section>
  )
}

function FichaTrampa({ trampa, lote }) {
  const [lat, lng] = puntoALeaflet(trampa.geom)
  const tipo = TIPOS_TRAMPA[trampa.tipo]
  return (
    <section className="tarjeta" aria-label="Trampa seleccionada">
      <div className="ficha__encabezado">
        <p className="ficha__antetitulo">Trampa seleccionada</p>
        <span className={`insignia insignia--${trampa.estado}`}>
          {ESTADOS_TRAMPA[trampa.estado]}
        </span>
      </div>
      <p className="ficha__titulo">{trampa.codigo_ica}</p>
      <p className="ficha__subtitulo">
        Lote {lote?.codigo ?? '—'} · {tipo.nombre} + {trampa.atrayente.toLowerCase()}
      </p>
      <dl className="ficha__datos">
        <dt>Lat</dt>
        <dd>{formatoCoordenada(lat)}</dd>
        <dt>Lon</dt>
        <dd>{formatoCoordenada(lng)}</dd>
        <dt>Instalada</dt>
        <dd>{fechaCorta(trampa.fecha_instalacion)}</dd>
        <dt>QR</dt>
        <dd>{trampa.codigo_qr}</dd>
      </dl>
      <Link to={`/trampas?trampa=${trampa.id}`} className="boton-secundario">
        Ver ficha y QR
      </Link>
    </section>
  )
}

function FichaLote({ lote, trampas, editable }) {
  return (
    <section className="tarjeta" aria-label="Lote seleccionado">
      <p className="ficha__antetitulo">Lote seleccionado</p>
      <p className="ficha__titulo">{lote.codigo}</p>
      <p className="ficha__subtitulo">{lote.nombre ?? 'Sin nombre'}</p>
      <dl className="ficha__datos">
        <dt>Área</dt>
        <dd>{formatoHa.format(lote.area_ha)} ha</dd>
        <dt>Trampas</dt>
        <dd>
          {trampas.length} ({activasDe(trampas)})
        </dd>
      </dl>
      <div className="grupo-botones">
        <Link to={`/lotes?lote=${lote.id}`} className="boton-secundario">
          {editable ? 'Editar lote' : 'Ver lote'}
        </Link>
        <Link to={`/trampas?lote=${lote.id}`} className="boton-primario">
          {editable ? 'Registrar trampa' : 'Ver trampas'}
        </Link>
      </div>
      {trampas.some((t) => t.estado !== 'retirada') && (
        <div className="ficha__etiquetas">
          <BotonEtiquetas lote={lote} />
        </div>
      )}
    </section>
  )
}

function activasDe(trampas) {
  const n = trampas.filter((t) => t.estado === 'activa').length
  return `${n} ${n === 1 ? 'activa' : 'activas'}`
}

function ResumenLotes({ lotes, trampas }) {
  return (
    <section className="tarjeta" aria-labelledby="titulo-resumen">
      <h2 id="titulo-resumen" className="tarjeta__titulo">
        Trampas por lote
      </h2>
      {lotes.length === 0 ? (
        <p className="formulario__nota">Aún no hay lotes registrados.</p>
      ) : (
        <ul className="lista-simple">
          {lotes.map((lote) => {
            const delLote = trampas.filter((t) => t.lote_id === lote.id)
            return (
              <li key={lote.id}>
                <span className="mono">{lote.codigo}</span>
                <span>
                  {activasDe(delLote)} de {delLote.length}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
