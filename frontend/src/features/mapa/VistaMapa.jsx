import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import { Link } from 'react-router'

import Encabezado from '../../components/Encabezado'
import MapaPredio from '../../components/MapaPredio'
import Plantilla from '../../components/Plantilla'
import { fechaCorta, fechaHora } from '../../utils/fechas'
import { formatoCoordenada, formatoHa } from '../../utils/formato'
import { geojsonALeaflet, puntoALeaflet } from '../../utils/geo'
import { useSesion } from '../auth/useSesion'
import CapaLimitePredio from '../predios/CapaLimitePredio'
import { usePredio } from '../predios/usePredio'
import { ROLES_CAMPO, ROLES_GESTION } from '../usuarios/roles'
import CapaLotes from '../lotes/CapaLotes'
import { COLOR_LIMITE, COLOR_LOTE } from './colores'
import BotonEtiquetas from '../trampas/BotonEtiquetas'
import CapaTrampas from '../trampas/CapaTrampas'
import { ESTADOS_TRAMPA, MONITOREO, TIPOS_TRAMPA } from '../trampas/catalogo'
import BotonesExportar from './BotonesExportar'
import { dias, textoRevision } from './monitoreo'
import { useMapa } from './useMapa'

// Vista general del predio: indicadores, mapa con el estado de monitoreo de las trampas (HU-18),
// filtro por lote y ficha de lo seleccionado.
export default function VistaMapa() {
  const { usuario } = useSesion()
  const editable = ROLES_GESTION.includes(usuario.rol)
  const registra = ROLES_CAMPO.includes(usuario.rol)
  const { predio } = usePredio()
  const mapa = useMapa(predio?.id)
  const [capas, setCapas] = useState({ lotes: true, trampas: true })
  // Lote elegido en el filtro ('' = todos).
  const [loteFiltro, setLoteFiltro] = useState('')
  // { lote } o { trampa } seleccionado en el mapa.
  const [seleccion, setSeleccion] = useState(null)
  const refCapas = useRef(new Map())

  const lotes = loteFiltro ? mapa.lotes.filter((l) => l.id === loteFiltro) : mapa.lotes
  const trampas = loteFiltro ? mapa.trampas.filter((t) => t.lote_id === loteFiltro) : mapa.trampas
  const activas = trampas.filter((t) => t.estado === 'activa')
  const porTipo = (tipo) => activas.filter((t) => t.tipo === tipo).length
  const porMonitoreo = (estado) => activas.filter((t) => t.monitoreo === estado).length
  const areaTotal = lotes.reduce((suma, l) => suma + l.area_ha, 0)
  const noActivas = trampas.length - activas.length
  // HU-20: rutas que quedaron desactualizadas al cambiar las trampas de su lote.
  const porRevisar = mapa.lotes.filter((l) => l.ruta?.requiere_revision)

  function filtrar(loteId) {
    setLoteFiltro(loteId)
    setSeleccion(loteId ? { lote: mapa.lotes.find((l) => l.id === loteId) } : null)
  }

  const alternar = (capa) => setCapas((c) => ({ ...c, [capa]: !c[capa] }))

  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: `${predio.nombre} · vereda ${predio.vereda}, ${predio.municipio}` }]}
        titulo="Mapa del predio"
      >
        <BotonesExportar predio={predio} />
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
      {mapa.error && (
        <p className="formulario__error" role="alert">
          {mapa.error}
        </p>
      )}

      <div className="indicadores">
        <Indicador
          etiqueta="Lotes registrados"
          valor={lotes.length}
          detalle={`${formatoHa.format(areaTotal)} ha delimitadas`}
        />
        <Indicador
          etiqueta="Trampas activas"
          valor={activas.length}
          detalle={`${porTipo('jackson')} Jackson · ${porTipo('mcphail')} McPhail`}
        />
        <Indicador
          etiqueta="Trampas por revisar"
          valor={porMonitoreo('pendiente') + porMonitoreo('vencida')}
          detalle={`${porMonitoreo('vencida')} vencidas · ${porMonitoreo('pendiente')} pendientes`}
        />
        <Indicador
          etiqueta="Trampas inactivas o retiradas"
          valor={noActivas}
          detalle={`${trampas.length} trampas registradas en total`}
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
            <div className="filtro-lote">
              <label htmlFor="filtro_lote">Lote</label>
              <select id="filtro_lote" value={loteFiltro} onChange={(e) => filtrar(e.target.value)}>
                <option value="">Todos los lotes</option>
                {mapa.lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo}
                    {l.nombre ? ` · ${l.nombre}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <p className="mapa-tarjeta__ayuda">Toque un lote o una trampa para ver su ficha</p>
          </div>
          {porRevisar.length > 0 && (
            <p className="formulario__aviso aviso-mapa" role="status">
              {porRevisar.length === 1
                ? 'La ruta de 1 lote requiere revisión:'
                : `Las rutas de ${porRevisar.length} lotes requieren revisión:`}{' '}
              {porRevisar.map((l, i) => (
                <span key={l.id}>
                  {i > 0 && ', '}
                  <Link to={`/rutas?lote=${l.id}`} title={l.ruta.motivo_revision}>
                    {l.codigo}
                  </Link>
                </span>
              ))}
            </p>
          )}
          <div className="mapa-tarjeta__lienzo">
            <MapaPredio>
              <CapaLimitePredio
                limite={predio.limite}
                color={predio.color_limite}
                encuadrar={mapa.lotesIniciales?.length === 0}
              />
              <EncuadreFiltro lotes={lotes} filtro={loteFiltro} />
              {capas.lotes && (
                <CapaLotes
                  lotes={lotes}
                  lotesIniciales={mapa.lotesIniciales}
                  seleccionadoId={seleccion?.lote?.id}
                  alSeleccionar={(lote) => setSeleccion({ lote })}
                  refCapas={refCapas}
                />
              )}
              {capas.trampas && (
                <CapaTrampas
                  trampas={trampas}
                  seleccionadaId={seleccion?.trampa?.id}
                  alSeleccionar={(trampa) => setSeleccion({ trampa })}
                  ventana={(trampa) => <VentanaTrampa trampa={trampa} registra={registra} />}
                />
              )}
            </MapaPredio>
          </div>
          <div className="mapa-tarjeta__leyenda">
            <span>
              <i
                className="leyenda__muestra"
                style={{ borderColor: COLOR_LOTE, background: `${COLOR_LOTE}55` }}
              />
              Lote
            </span>
            {predio.limite && (
              <span>
                <i
                  className="leyenda__muestra leyenda__muestra--limite"
                  style={{ borderColor: predio.color_limite ?? COLOR_LIMITE }}
                />
                Límite del predio
              </span>
            )}
            <span>
              <i className="leyenda__muestra leyenda__muestra--circulo" />
              Jackson
            </span>
            <span>
              <i className="leyenda__muestra" />
              McPhail
            </span>
            {Object.entries(MONITOREO).map(([clave, texto]) => (
              <span key={clave}>
                <i
                  className={`leyenda__muestra leyenda__muestra--circulo leyenda__muestra--${clave}`}
                />
                {texto}
              </span>
            ))}
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
            <FichaTrampa trampa={seleccion.trampa} umbrales={mapa.umbrales} registra={registra} />
          )}
          {seleccion?.lote && (
            <FichaLote
              lote={seleccion.lote}
              trampas={mapa.trampas.filter((t) => t.lote_id === seleccion.lote.id)}
              editable={editable}
            />
          )}
          {!seleccion && (
            <section className="tarjeta">
              <p className="ficha__antetitulo">Ficha</p>
              <p>Seleccione un lote o una trampa en el mapa para ver sus datos.</p>
            </section>
          )}
          <ResumenLotes lotes={lotes} trampas={trampas} />
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

// Al encuadrar por el filtro: el lote elegido o, al volver a «Todos», todos los lotes.
function EncuadreFiltro({ lotes, filtro }) {
  const map = useMap()
  const anterior = useRef(filtro)
  useEffect(() => {
    if (anterior.current === filtro || lotes.length === 0) return
    anterior.current = filtro
    const limites = lotes.flatMap((lote) => geojsonALeaflet(lote.geom)[0])
    map.fitBounds(limites, { padding: [24, 24], maxZoom: 18 })
  }, [map, lotes, filtro])
  return null
}

function InsigniaMonitoreo({ trampa }) {
  return trampa.monitoreo ? (
    <span className={`insignia insignia--${trampa.monitoreo}`}>{MONITOREO[trampa.monitoreo]}</span>
  ) : (
    <span className={`insignia insignia--${trampa.estado}`}>{ESTADOS_TRAMPA[trampa.estado]}</span>
  )
}

// Ventana que se abre sobre la trampa al tocarla en el mapa (cómoda en el teléfono).
function VentanaTrampa({ trampa, registra }) {
  const tipo = TIPOS_TRAMPA[trampa.tipo]
  return (
    <div className="ventana-trampa" aria-label={`Trampa ${trampa.codigo_ica}`}>
      <p className="ventana-trampa__titulo">{trampa.codigo_ica}</p>
      <p>
        Lote {trampa.lote_codigo} · {tipo.nombre}
      </p>
      <p>
        <InsigniaMonitoreo trampa={trampa} />
      </p>
      <p>{textoRevision(trampa)}</p>
      <p>
        Última lectura:{' '}
        {trampa.ultima_lectura ? fechaHora(trampa.ultima_lectura) : 'sin lecturas aún'}
      </p>
      <p className="grupo-enlaces">
        {registra && trampa.estado === 'activa' && (
          <Link to={`/t/${trampa.codigo_qr}/lectura`}>Registrar lectura</Link>
        )}
        <Link to={`/t/${trampa.codigo_qr}`}>Abrir ficha</Link>
      </p>
    </div>
  )
}

function FichaTrampa({ trampa, umbrales, registra }) {
  const [lat, lng] = puntoALeaflet(trampa.geom)
  const tipo = TIPOS_TRAMPA[trampa.tipo]
  return (
    <section className="tarjeta" aria-label="Trampa seleccionada">
      <div className="ficha__encabezado">
        <p className="ficha__antetitulo">Trampa seleccionada</p>
        <InsigniaMonitoreo trampa={trampa} />
      </div>
      <p className="ficha__titulo">{trampa.codigo_ica}</p>
      <p className="ficha__subtitulo">
        Lote {trampa.lote_codigo} · {tipo.nombre} + {trampa.atrayente.toLowerCase()}
      </p>
      <dl className="ficha__datos">
        <dt>Estado</dt>
        <dd>{ESTADOS_TRAMPA[trampa.estado]}</dd>
        <dt>Revisión</dt>
        <dd>{textoRevision(trampa)}</dd>
        <dt>Última lectura</dt>
        <dd>{trampa.ultima_lectura ? fechaHora(trampa.ultima_lectura) : 'Sin lecturas aún'}</dd>
        <dt>Lat</dt>
        <dd>{formatoCoordenada(lat)}</dd>
        <dt>Lon</dt>
        <dd>{formatoCoordenada(lng)}</dd>
        <dt>Instalada</dt>
        <dd>{fechaCorta(trampa.fecha_instalacion)}</dd>
        <dt>QR</dt>
        <dd>{trampa.codigo_qr}</dd>
      </dl>
      {umbrales && trampa.monitoreo && (
        <p className="formulario__nota">
          Revisión cada {dias(umbrales.dias_revision)}: pendiente desde el día{' '}
          {umbrales.dias_revision}, vencida desde el día {umbrales.dias_vencida}.
        </p>
      )}
      <div className="grupo-botones">
        {registra && trampa.estado === 'activa' && (
          <Link to={`/t/${trampa.codigo_qr}/lectura`} className="boton-primario">
            Registrar lectura
          </Link>
        )}
        <Link to={`/trampas?trampa=${trampa.id}`} className="boton-secundario">
          Ver ficha y QR
        </Link>
      </div>
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
        <dt>Ruta</dt>
        <dd>
          {!lote.ruta ? (
            'Sin ruta definida'
          ) : lote.ruta.requiere_revision ? (
            <span className="insignia insignia--inactiva" title={lote.ruta.motivo_revision}>
              Requiere revisión
            </span>
          ) : (
            'Al día'
          )}
        </dd>
      </dl>
      {lote.ruta?.requiere_revision && (
        <p className="formulario__nota">{lote.ruta.motivo_revision}.</p>
      )}
      <div className="grupo-botones">
        <Link to={`/lotes?lote=${lote.id}`} className="boton-secundario">
          {editable ? 'Editar lote' : 'Ver lote'}
        </Link>
        <Link to={`/trampas?lote=${lote.id}`} className="boton-primario">
          {editable ? 'Registrar trampa' : 'Ver trampas'}
        </Link>
        <Link to={`/rutas?lote=${lote.id}`} className="boton-secundario">
          Ver ruta
        </Link>
      </div>
      <div className="grupo-botones ficha__etiquetas">
        <BotonesExportar lote={lote} />
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
