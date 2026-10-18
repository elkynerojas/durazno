import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { historialCapturas, historialCsv } from '../../api/client'
import Encabezado from '../../components/Encabezado'
import Plantilla from '../../components/Plantilla'
import { descargar } from '../../utils/descargas'
import { fechaHora } from '../../utils/fechas'
import { useDatosPredio } from '../mapa/useDatosPredio'
import { usePredio } from '../predios/usePredio'
import { formatoMtd } from './formato'
import GraficoCapturas from './GraficoCapturas'

const POR_PAGINA = 50

// Filtros del formulario → parámetros de la API (la trampa manda sobre el lote).
function aParametros(f, predioId) {
  const ambito = f.trampa
    ? { trampa_id: f.trampa }
    : f.lote
      ? { lote_id: f.lote }
      : { predio_id: predioId }
  return { ...ambito, desde: f.desde, hasta: f.hasta, especie: f.especie }
}
const ESTADOS = { registrada: 'Sin validar', validada: 'Validada' }

// Historial de capturas por trampa, lote o predio (HU-27): filtros, gráfico, tabla y CSV.
// Acepta ?lote= o ?trampa= para abrirse desde el mapa o la ficha de una trampa.
export default function VistaHistorial() {
  const { predio } = usePredio()
  const datos = useDatosPredio(predio.id)
  const [parametros] = useSearchParams()
  const trampaInicial = parametros.get('trampa') ?? ''
  const [filtros, setFiltros] = useState({
    lote: parametros.get('lote') ?? '',
    trampa: trampaInicial,
    desde: '',
    hasta: '',
    especie: '',
  })
  const [consulta, setConsulta] = useState(filtros)
  const [pagina, setPagina] = useState(1)
  const [historial, setHistorial] = useState(null)
  const [error, setError] = useState(null)

  // Con la trampa del enlace, el lote se deduce cuando cargan las trampas.
  const loteDeTrampa = datos.trampas.find((t) => t.id === filtros.trampa)?.lote_id ?? ''
  const loteElegido = filtros.lote || loteDeTrampa
  const trampasDelLote = datos.trampas.filter((t) => t.lote_id === loteElegido)

  useEffect(() => {
    let vigente = true
    historialCapturas({ ...aParametros(consulta, predio.id), pagina, por_pagina: POR_PAGINA })
      .then((respuesta) => {
        if (!vigente) return
        setHistorial(respuesta)
        setError(null)
        setFiltros((f) => ({
          ...f,
          desde: f.desde || respuesta.desde,
          hasta: f.hasta || respuesta.hasta,
        }))
      })
      .catch(
        (e) =>
          vigente &&
          setError(
            typeof e.detalle === 'string' ? e.detalle : 'No se pudo consultar el historial.',
          ),
      )
    return () => {
      vigente = false
    }
  }, [consulta, pagina, predio.id])

  async function exportar() {
    setError(null)
    try {
      descargar(
        await historialCsv(aParametros(consulta, predio.id)),
        `historial-${predio.nombre}.csv`,
      )
    } catch {
      setError('No se pudo exportar el historial.')
    }
  }

  const cambiar = (campo) => (e) =>
    setFiltros((f) => ({
      ...f,
      [campo]: e.target.value,
      ...(campo === 'lote' && { trampa: '' }),
    }))
  const paginas = historial ? Math.max(1, Math.ceil(historial.total / POR_PAGINA)) : 1

  return (
    <Plantilla>
      <Encabezado
        migas={[
          { texto: predio.nombre, a: '/mapa' },
          { texto: 'MTD', a: '/mtd' },
          { texto: 'Historial' },
        ]}
        titulo="Historial de capturas"
      >
        <button type="button" className="boton-secundario" onClick={exportar}>
          Exportar CSV
        </button>
        <Link to="/mtd" className="boton-secundario">
          Ver MTD del predio
        </Link>
      </Encabezado>

      <form
        className="formulario filtro-mtd"
        aria-label="Filtros del historial"
        onSubmit={(e) => {
          e.preventDefault()
          setPagina(1)
          setConsulta({ ...filtros, lote: loteElegido })
        }}
      >
        <div>
          <label htmlFor="historial_lote">Lote</label>
          <select id="historial_lote" value={loteElegido} onChange={cambiar('lote')}>
            <option value="">Todo el predio</option>
            {datos.lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="historial_trampa">Trampa</label>
          <select
            id="historial_trampa"
            value={filtros.trampa}
            onChange={cambiar('trampa')}
            disabled={!loteElegido}
          >
            <option value="">Todas las del lote</option>
            {trampasDelLote.map((t) => (
              <option key={t.id} value={t.id}>
                {t.codigo_ica}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="historial_especie">Especie</label>
          <select id="historial_especie" value={filtros.especie} onChange={cambiar('especie')}>
            <option value="">Ambas</option>
            <option value="capitata">C. capitata (Jackson)</option>
            <option value="anastrepha">Anastrepha (McPhail)</option>
          </select>
        </div>
        <div>
          <label htmlFor="historial_desde">Desde</label>
          <input
            id="historial_desde"
            type="date"
            value={filtros.desde}
            onChange={cambiar('desde')}
          />
        </div>
        <div>
          <label htmlFor="historial_hasta">Hasta</label>
          <input
            id="historial_hasta"
            type="date"
            value={filtros.hasta}
            onChange={cambiar('hasta')}
          />
        </div>
        <button type="submit" className="boton-primario">
          Consultar
        </button>
      </form>

      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      {!historial && !error && <p className="cargando">Consultando…</p>}
      {historial && (
        <section className="tarjeta" aria-label="Capturas">
          <p className="formulario__nota">
            {historial.total} {historial.total === 1 ? 'lectura' : 'lecturas'} (sin las rechazadas)
          </p>
          {historial.serie.length > 0 && <GraficoCapturas serie={historial.serie} />}
          {historial.total === 0 ? (
            <p>No hay lecturas en ese periodo.</p>
          ) : (
            <>
              <div className="tabla-contenedor">
                <table className="tabla" aria-label="Lecturas">
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">Trampa</th>
                      <th scope="col">C. capitata</th>
                      <th scope="col">Anastrepha</th>
                      <th scope="col">Días</th>
                      <th scope="col">MTD</th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.lecturas.map((l) => (
                      <tr key={l.id}>
                        <td>{fechaHora(l.observado_en)}</td>
                        <td>
                          {l.trampa_codigo_ica}
                          <span className="tabla-mtd__fechas">Lote {l.lote_codigo}</span>
                        </td>
                        <td>
                          {l.capitata_machos + l.capitata_hembras} ({l.capitata_machos} ♂ ·{' '}
                          {l.capitata_hembras} ♀)
                        </td>
                        <td>{l.anastrepha}</td>
                        <td>{l.dias_exposicion}</td>
                        <td>{l.mtd === null ? 'sin dato' : formatoMtd.format(l.mtd)}</td>
                        <td>{ESTADOS[l.estado] ?? l.estado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {paginas > 1 && (
                <div className="grupo-botones paginacion" role="group" aria-label="Páginas">
                  <button
                    type="button"
                    className="boton-secundario"
                    disabled={pagina === 1}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {pagina} de {paginas}
                  </span>
                  <button
                    type="button"
                    className="boton-secundario"
                    disabled={pagina === paginas}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </Plantilla>
  )
}
