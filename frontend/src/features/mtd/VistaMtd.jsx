import { useEffect, useState } from 'react'

import { obtenerMtd } from '../../api/client'
import Encabezado from '../../components/Encabezado'
import Plantilla from '../../components/Plantilla'
import { rangoSemana, semanaDelAnio } from '../../utils/fechas'
import { usePredio } from '../predios/usePredio'
import { ESPECIES, formula, textoMtd } from './formato'
import GraficoTendencia from './GraficoTendencia'

const formatoDias = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

// Índice MTD del predio (HU-28): por especie, consolidado del periodo, tendencia semanal y la
// tabla con M, T y D de cada semana.
export default function VistaMtd() {
  const { predio } = usePredio()
  const [rango, setRango] = useState({ desde: '', hasta: '' })
  const [consulta, setConsulta] = useState({ desde: '', hasta: '' })
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    obtenerMtd(predio.id, consulta.desde, consulta.hasta)
      .then((respuesta) => {
        if (!vigente) return
        setDatos(respuesta)
        setRango({ desde: respuesta.desde, hasta: respuesta.hasta })
        setError(null)
      })
      .catch(
        (e) =>
          vigente &&
          setError(typeof e.detalle === 'string' ? e.detalle : 'No se pudo calcular el MTD.'),
      )
    return () => {
      vigente = false
    }
  }, [predio.id, consulta])

  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: predio.nombre, a: '/mapa' }, { texto: 'MTD' }]}
        titulo="Índice MTD del predio"
      />
      <form
        className="formulario filtro-mtd"
        aria-label="Periodo"
        onSubmit={(e) => {
          e.preventDefault()
          setConsulta(rango)
        }}
      >
        <div>
          <label htmlFor="mtd_desde">Desde</label>
          <input
            id="mtd_desde"
            type="date"
            value={rango.desde}
            onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
            required
          />
        </div>
        <div>
          <label htmlFor="mtd_hasta">Hasta</label>
          <input
            id="mtd_hasta"
            type="date"
            value={rango.hasta}
            onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
            required
          />
        </div>
        <button type="submit" className="boton-primario">
          Calcular
        </button>
      </form>
      <p className="formulario__nota">
        MTD = M ÷ (T × D): M moscas capturadas, T trampas revisadas, D días promedio de exposición.
        Consolidado del predio, por especie; no incluye lecturas rechazadas.
      </p>
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      {!datos && !error && <p className="cargando">Calculando…</p>}
      {datos &&
        datos.periodo.map((resumen) => {
          const especie = ESPECIES[resumen.especie]
          const semanas = datos.semanas.filter((f) => f.especie === resumen.especie)
          return (
            <section
              key={resumen.especie}
              className="tarjeta tarjeta-mtd"
              aria-label={`MTD de ${especie.nombre}`}
            >
              <div className="tarjeta-mtd__encabezado">
                <div>
                  <h2 className="tarjeta__titulo">
                    <em>{especie.nombre}</em> · {especie.trampas}
                  </h2>
                  <p className="formulario__nota">MTD del periodo</p>
                  <p className="tarjeta-mtd__valor">{textoMtd(resumen)}</p>
                  <p className="mono">{formula(resumen)}</p>
                  {resumen.pendientes > 0 && (
                    <p className="formulario__aviso">
                      Incluye {resumen.pendientes}{' '}
                      {resumen.pendientes === 1 ? 'lectura' : 'lecturas'} sin validar.
                    </p>
                  )}
                </div>
                <GraficoTendencia
                  filas={semanas}
                  titulo={`Tendencia del MTD de ${especie.nombre}`}
                />
              </div>
              <div className="tabla-contenedor">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Semana</th>
                      <th scope="col">M</th>
                      <th scope="col">T</th>
                      <th scope="col">D</th>
                      <th scope="col">MTD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...semanas].reverse().map((f) => (
                      <tr key={`${f.anio}-${f.semana}`}>
                        <th scope="row">
                          S{f.semana}
                          <span className="tabla-mtd__fechas">
                            {rangoSemana(semanaDelAnio(f.anio, f.semana))}
                          </span>
                        </th>
                        <td>{f.moscas}</td>
                        <td>{f.trampas}</td>
                        <td>{formatoDias.format(f.dias_promedio)}</td>
                        <td>{textoMtd(f)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}
    </Plantilla>
  )
}
