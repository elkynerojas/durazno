import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { resolverQr } from '../../api/client'
import Encabezado from '../../components/Encabezado'
import Plantilla from '../../components/Plantilla'
import { fechaCorta } from '../../utils/fechas'
import { formatoCoordenada } from '../../utils/formato'
import { puntoALeaflet } from '../../utils/geo'
import { useSesion } from '../auth/useSesion'
import { usePredio } from '../predios/usePredio'
import { ESTADOS_TRAMPA, TIPOS_TRAMPA } from './catalogo'
import ReponerEtiqueta from './ReponerEtiqueta'

// Lo que se abre al escanear el QR de una trampa: <dominio>/t/<código>.
export default function VistaFichaTrampa() {
  const { codigo } = useParams()
  const [estado, setEstado] = useState({ codigo, cargando: true })
  const { predio, seleccionar } = usePredio()

  // Al escanear una trampa de otro predio asignado, ese pasa a ser el predio actual.
  const predioTrampa = estado.datos?.lote.predio_id
  useEffect(() => {
    if (predioTrampa && predioTrampa !== predio?.id) seleccionar(predioTrampa)
  }, [predioTrampa, predio?.id, seleccionar])

  useEffect(() => {
    let vigente = true
    resolverQr(codigo)
      .then((datos) => vigente && setEstado({ codigo, datos }))
      .catch(
        (e) =>
          vigente &&
          setEstado({
            codigo,
            error: [404, 410].includes(e.estado)
              ? e.message
              : 'No se pudo consultar la trampa. Intente de nuevo.',
          }),
      )
    return () => {
      vigente = false
    }
  }, [codigo])

  // Mientras llega la respuesta de un código nuevo no se muestra la ficha anterior.
  const vigente = estado.codigo === codigo ? estado : { cargando: true }

  return (
    <Plantilla>
      {vigente.cargando && <p className="cargando">Buscando la trampa…</p>}
      {vigente.error && <CodigoNoEncontrado mensaje={vigente.error} />}
      {vigente.datos && <Ficha {...vigente.datos} />}
    </Plantilla>
  )
}

function Ficha({ trampa, lote, ruta, ultima_lectura }) {
  const { usuario } = useSesion()
  const { predio } = usePredio()
  const navegar = useNavigate()
  const [lat, lng] = puntoALeaflet(trampa.geom)
  const tipo = TIPOS_TRAMPA[trampa.tipo]
  const registra = usuario.rol !== 'productor'

  return (
    <>
      <Encabezado
        migas={[
          { texto: predio?.nombre ?? 'Predio', a: '/mapa' },
          { texto: `Lote ${lote.codigo}`, a: `/lotes?lote=${lote.id}` },
          { texto: 'Trampa' },
        ]}
        titulo={trampa.codigo_ica}
      >
        <Link to={`/trampas?trampa=${trampa.id}`} className="boton-secundario">
          Ver en el mapa
        </Link>
      </Encabezado>

      {trampa.estado === 'retirada' && (
        <p className="formulario__error" role="alert">
          Esta trampa fue retirada del campo. No registre lecturas en ella; si la etiqueta sigue
          instalada, avise al agrónomo.
        </p>
      )}
      {trampa.estado === 'inactiva' && (
        <p className="formulario__aviso" role="alert">
          Esta trampa está inactiva: confirme con el agrónomo antes de registrar una lectura.
        </p>
      )}

      <div className="rejilla rejilla--ficha">
        <section className="tarjeta" aria-labelledby="titulo-ficha">
          <div className="ficha__encabezado">
            <h2 id="titulo-ficha" className="tarjeta__titulo">
              Ficha de la trampa
            </h2>
            <span className={`insignia insignia--${trampa.estado}`}>
              {ESTADOS_TRAMPA[trampa.estado]}
            </span>
          </div>
          <dl className="ficha__datos">
            <dt>Código ICA</dt>
            <dd>{trampa.codigo_ica}</dd>
            <dt>Tipo</dt>
            <dd>
              {tipo.nombre} + {trampa.atrayente.toLowerCase()}
            </dd>
            <dt>Vigilancia</dt>
            <dd>
              <em>{tipo.especie}</em>
            </dd>
            <dt>Lote</dt>
            <dd>
              {lote.codigo}
              {lote.nombre ? ` · ${lote.nombre}` : ''}
            </dd>
            <dt>Ruta</dt>
            <dd>
              {ruta ? (
                <Link to={`/rutas?lote=${lote.id}`}>
                  Parada {ruta.orden} de {ruta.total}
                  {ruta.siguiente ? ` · sigue ${ruta.siguiente}` : ' · última'}
                </Link>
              ) : (
                'Sin ruta definida'
              )}
            </dd>
            <dt>Coordenadas</dt>
            <dd>
              {formatoCoordenada(lat)}, {formatoCoordenada(lng)}
            </dd>
            {trampa.precision_m != null && (
              <>
                <dt>Precisión GPS</dt>
                <dd>±{trampa.precision_m} m</dd>
              </>
            )}
            <dt>Instalada</dt>
            <dd>{fechaCorta(trampa.fecha_instalacion)}</dd>
            <dt>Código QR</dt>
            <dd>{trampa.codigo_qr}</dd>
          </dl>
          <ReponerEtiqueta
            trampa={trampa}
            puedeReemplazar={registra}
            alReemplazar={(nueva) => navegar(`/t/${nueva.codigo_qr}`, { replace: true })}
          />
        </section>

        <section className="tarjeta" aria-labelledby="titulo-lectura">
          <h2 id="titulo-lectura" className="tarjeta__titulo">
            Última lectura
          </h2>
          {!ultima_lectura && (
            <p className="formulario__nota">Aún no hay lecturas registradas para esta trampa.</p>
          )}
          {registra && (
            <>
              <button
                type="button"
                className="boton-primario boton-bloque"
                disabled
                aria-describedby="nota-lectura"
              >
                Registrar lectura
              </button>
              <p id="nota-lectura" className="formulario__nota ficha__nota-boton">
                El formulario de lectura estará disponible próximamente.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  )
}

// Código mal leído o de una trampa que ya no existe: se puede escribir el de la etiqueta.
function CodigoNoEncontrado({ mensaje }) {
  const navegar = useNavigate()
  const [codigo, setCodigo] = useState('')

  return (
    <>
      <Encabezado migas={[{ texto: 'Inicio', a: '/mapa' }]} titulo="Trampa no encontrada" />
      <section className="tarjeta contenido-angosto">
        <p className="formulario__error" role="alert">
          {mensaje}
        </p>
        <form
          className="formulario"
          onSubmit={(e) => {
            e.preventDefault()
            navegar(`/t/${codigo.trim().toUpperCase()}`)
          }}
        >
          <label htmlFor="codigo_etiqueta">Escriba el código impreso bajo el QR</label>
          <input
            id="codigo_etiqueta"
            className="mono"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ABCD2345"
            required
          />
          <div className="formulario__acciones formulario__acciones--inicio">
            <button type="submit" className="boton-primario">
              Buscar trampa
            </button>
            <Link to="/mapa" className="boton-secundario">
              Ir al mapa
            </Link>
          </div>
        </form>
      </section>
    </>
  )
}
