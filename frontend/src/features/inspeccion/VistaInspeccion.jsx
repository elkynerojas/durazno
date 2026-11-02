import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { listarHallazgos, listarTiposHallazgo } from '../../api/client'
import Encabezado from '../../components/Encabezado'
import MapaPredio from '../../components/MapaPredio'
import Plantilla from '../../components/Plantilla'
import { fechaHora } from '../../utils/fechas'
import { puntoEnPoligono } from '../../utils/geo'
import { useSesion } from '../auth/useSesion'
import CapaLotes from '../lotes/CapaLotes'
import { useDatosPredio } from '../mapa/useDatosPredio'
import CapaLimitePredio from '../predios/CapaLimitePredio'
import { usePredio } from '../predios/usePredio'
import { CapturaClic } from '../trampas/CapaTrampas'
import { ROLES_CAMPO } from '../usuarios/roles'
import AdministrarTipos from './AdministrarTipos'
import CapaHallazgos from './CapaHallazgos'
import { ESTADOS_HALLAZGO, textoEstado } from './catalogo'
import FichaHallazgo from './FichaHallazgo'
import FormularioHallazgo from './FormularioHallazgo'

const SIN_COORDENADAS = { lat: '', lng: '' }
const SIN_FILTROS = { lote_id: '', tipo_id: '', estado: '', desde: '', hasta: '' }
const POR_PAGINA = 200

// Inspección (E9, funcionalidad extra): hallazgos del cultivo (hongos, plagas, árboles
// enfermos…) en el mapa y en una lista con filtros; el registro con GPS y fotos (HU-41) y, para el
// administrador, el catálogo de tipos (HU-40).
export default function VistaInspeccion() {
  const { usuario } = useSesion()
  const { predio } = usePredio()
  const puedeRegistrar = ROLES_CAMPO.includes(usuario.rol)
  const esAdmin = usuario.rol === 'administrador'
  const datos = useDatosPredio(predio.id)
  const [parametros, setParametros] = useSearchParams()
  const pestana = esAdmin && parametros.get('pestana') === 'tipos' ? 'tipos' : 'hallazgos'
  const registrando = puedeRegistrar && parametros.get('registrar') === '1'
  const seleccionadoId = parametros.get('hallazgo')

  const [tipos, setTipos] = useState([])
  const [filtros, setFiltros] = useState(SIN_FILTROS)
  const [respuesta, setRespuesta] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [coordenadas, setCoordenadas] = useState(SIN_COORDENADAS)
  const [loteElegido, setLoteElegido] = useState(null)
  // Lote elegido en la lista del formulario: el mapa se acerca a él para tocar el punto. El que
  // se sugiere al tocar no mueve la vista.
  const [loteEncuadre, setLoteEncuadre] = useState(null)
  const [capturando, setCapturando] = useState(false)
  const refPanel = useRef(null)
  const refMapa = useRef(null)
  const refCapas = useRef(new Map())

  useEffect(() => {
    let vigente = true
    listarTiposHallazgo()
      .then((lista) => vigente && setTipos(lista))
      .catch(() => vigente && setTipos([]))
    return () => {
      vigente = false
    }
  }, [])

  useEffect(() => {
    let vigente = true
    listarHallazgos(predio.id, { ...filtros, por_pagina: POR_PAGINA })
      .then((r) => vigente && setRespuesta(r))
      .catch(() => vigente && setError('No se pudieron cargar los hallazgos.'))
    return () => {
      vigente = false
    }
  }, [predio.id, filtros])

  const hallazgos = respuesta?.hallazgos ?? []
  const encuadre = useMemo(() => {
    const lote = registrando && datos.lotes.find((l) => l.id === loteEncuadre)
    return lote ? [lote] : datos.lotesIniciales
  }, [registrando, loteEncuadre, datos.lotes, datos.lotesIniciales])
  const seleccionado = hallazgos.find((h) => h.id === seleccionadoId) ?? null

  function irA(nuevos) {
    setParametros(nuevos, { replace: true })
  }

  function abrirRegistro() {
    setCoordenadas(SIN_COORDENADAS)
    setLoteElegido(filtros.lote_id || null)
    setLoteEncuadre(filtros.lote_id || null)
    setCapturando(false)
    setAviso(null)
    irA({ registrar: '1' })
  }

  function cerrarPanel() {
    setCapturando(false)
    irA({})
  }

  function abrirHallazgo(h) {
    setCapturando(false)
    irA({ hallazgo: h.id })
    refPanel.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  // Un punto tocado o escrito dentro de un lote lo sugiere como lote del hallazgo.
  function cambiarCoordenadas(nuevas) {
    setCoordenadas(nuevas)
    const punto = [Number(nuevas.lat), Number(nuevas.lng)]
    if (nuevas.lat === '' || nuevas.lng === '' || punto.some((n) => !Number.isFinite(n))) return
    const contenedor = datos.lotes.find((l) => puntoEnPoligono(punto, l.geom))
    if (contenedor) setLoteElegido(contenedor.id)
  }

  function alGuardar(hallazgo) {
    setRespuesta((r) => ({
      ...r,
      total: (r?.total ?? 0) + 1,
      hallazgos: [hallazgo, ...(r?.hallazgos ?? [])],
    }))
    setAviso(`Hallazgo «${hallazgo.titulo}» registrado.`)
    abrirHallazgo(hallazgo)
  }

  function alCambiar(hallazgo) {
    setRespuesta((r) => ({
      ...r,
      hallazgos: r.hallazgos.map((h) => (h.id === hallazgo.id ? hallazgo : h)),
    }))
  }

  function alEliminar(id) {
    setRespuesta((r) => ({
      ...r,
      total: r.total - 1,
      hallazgos: r.hallazgos.filter((h) => h.id !== id),
    }))
    setAviso('Hallazgo eliminado.')
    irA({})
  }

  const cambiarFiltro = (campo) => (evento) =>
    setFiltros((f) => ({ ...f, [campo]: evento.target.value }))

  const [lat, lng] = [Number(coordenadas.lat), Number(coordenadas.lng)]
  const ubicacion =
    registrando &&
    coordenadas.lat !== '' &&
    coordenadas.lng !== '' &&
    isFinite(lat) &&
    isFinite(lng)
      ? [lat, lng]
      : null

  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: predio.nombre, a: '/mapa' }, { texto: 'Inspección' }]}
        titulo="Inspección"
      >
        {pestana === 'hallazgos' && puedeRegistrar && !registrando && (
          <button type="button" className="boton-primario" onClick={abrirRegistro}>
            Registrar hallazgo
          </button>
        )}
      </Encabezado>

      {esAdmin && (
        <div className="grupo-botones pestanas" role="group" aria-label="Sección">
          <button
            type="button"
            className="boton-secundario"
            aria-pressed={pestana === 'hallazgos'}
            onClick={() => irA({})}
          >
            Hallazgos
          </button>
          <button
            type="button"
            className="boton-secundario"
            aria-pressed={pestana === 'tipos'}
            onClick={() => irA({ pestana: 'tipos' })}
          >
            Tipos de hallazgo
          </button>
        </div>
      )}

      {pestana === 'tipos' ? (
        <AdministrarTipos />
      ) : (
        <>
          {aviso && (
            <p className="formulario__exito" role="status">
              {aviso}
            </p>
          )}
          {(error || datos.error) && (
            <p className="formulario__error" role="alert">
              {error ?? datos.error}
            </p>
          )}

          <div className="rejilla rejilla--mapa">
            <section
              ref={refMapa}
              className="tarjeta tarjeta--sin-relleno"
              aria-label="Mapa de hallazgos"
            >
              <div className="mapa-tarjeta__barra">
                <strong>
                  {capturando ? 'Toque el punto del hallazgo' : 'Hallazgos del predio'}
                </strong>
              </div>
              <div className="mapa-tarjeta__lienzo">
                <MapaPredio>
                  <CapaLimitePredio
                    limite={predio.limite}
                    color={predio.color_limite}
                    encuadrar={datos.lotesIniciales?.length === 0}
                  />
                  <CapaLotes
                    lotes={datos.lotes}
                    lotesIniciales={encuadre}
                    seleccionadoId={registrando ? loteElegido : null}
                    refCapas={refCapas}
                    alSeleccionar={(l) => registrando && !capturando && setLoteElegido(l.id)}
                  />
                  <CapaHallazgos
                    hallazgos={hallazgos}
                    seleccionadoId={seleccionado?.id}
                    ubicacion={ubicacion}
                    alSeleccionar={capturando ? undefined : abrirHallazgo}
                  />
                  {capturando && (
                    <CapturaClic
                      alTocar={([la, ln]) =>
                        cambiarCoordenadas({ lat: la.toFixed(6), lng: ln.toFixed(6) })
                      }
                    />
                  )}
                </MapaPredio>
              </div>
            </section>

            <section ref={refPanel} className="tarjeta" aria-label="Detalle">
              {registrando && !datos.cargando ? (
                <FormularioHallazgo
                  lotes={datos.lotes}
                  tipos={tipos}
                  loteId={loteElegido}
                  alCambiarLote={(id) => {
                    setLoteElegido(id)
                    setLoteEncuadre(id)
                  }}
                  coordenadas={coordenadas}
                  alCambiarCoordenadas={cambiarCoordenadas}
                  alCapturar={() => {
                    setCapturando(true)
                    refMapa.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
                  }}
                  alGuardar={alGuardar}
                  alCancelar={cerrarPanel}
                />
              ) : seleccionado ? (
                <FichaHallazgo
                  key={seleccionado.id}
                  hallazgo={seleccionado}
                  usuario={usuario}
                  alCambiar={alCambiar}
                  alEliminar={alEliminar}
                  alCerrar={cerrarPanel}
                />
              ) : (
                <p className="formulario__nota">
                  Toque un hallazgo en el mapa o en la lista para ver su detalle
                  {puedeRegistrar ? ', o registre uno nuevo.' : '.'}
                </p>
              )}
            </section>
          </div>

          <section className="tarjeta" aria-label="Lista de hallazgos">
            <div className="tarjeta__cabecera">
              <h2 className="tarjeta__titulo">
                Hallazgos{respuesta ? ` (${respuesta.total})` : ''}
              </h2>
            </div>
            <div className="formulario filtro-mtd">
              <div>
                <label htmlFor="filtro_lote">Lote</label>
                <select
                  id="filtro_lote"
                  value={filtros.lote_id}
                  onChange={cambiarFiltro('lote_id')}
                >
                  <option value="">Todos los lotes</option>
                  {datos.lotes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.codigo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filtro_tipo">Tipo</label>
                <select
                  id="filtro_tipo"
                  value={filtros.tipo_id}
                  onChange={cambiarFiltro('tipo_id')}
                >
                  <option value="">Todos los tipos</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filtro_estado">Estado</label>
                <select
                  id="filtro_estado"
                  value={filtros.estado}
                  onChange={cambiarFiltro('estado')}
                >
                  <option value="">Todos los estados</option>
                  {Object.entries(ESTADOS_HALLAZGO).map(([valor, nombre]) => (
                    <option key={valor} value={valor}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filtro_desde">Desde</label>
                <input
                  id="filtro_desde"
                  type="date"
                  value={filtros.desde}
                  onChange={cambiarFiltro('desde')}
                />
              </div>
              <div>
                <label htmlFor="filtro_hasta">Hasta</label>
                <input
                  id="filtro_hasta"
                  type="date"
                  value={filtros.hasta}
                  onChange={cambiarFiltro('hasta')}
                />
              </div>
            </div>
            {!respuesta && !error && <p className="cargando">Cargando hallazgos…</p>}
            {respuesta?.hallazgos.length === 0 && (
              <p className="formulario__nota">No hay hallazgos con estos filtros.</p>
            )}
            {hallazgos.length > 0 && (
              <ul className="lista-hallazgos">
                {hallazgos.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="lista-hallazgos__item"
                      aria-pressed={h.id === seleccionado?.id}
                      onClick={() => abrirHallazgo(h)}
                    >
                      <span
                        className="tipo-hallazgo__muestra"
                        style={{ background: h.tipo_color }}
                        aria-hidden="true"
                      />
                      <span className="lista-hallazgos__texto">
                        <strong>{h.titulo}</strong>
                        <span>
                          {h.tipo_nombre} · Lote {h.lote_codigo} · {fechaHora(h.observado_en)}
                          {h.evidencias.length > 0 &&
                            ` · ${h.evidencias.length} ${h.evidencias.length === 1 ? 'foto' : 'fotos'}`}
                        </span>
                      </span>
                      <span className={`insignia insignia--hallazgo-${h.estado}`}>
                        {textoEstado(h)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Plantilla>
  )
}
