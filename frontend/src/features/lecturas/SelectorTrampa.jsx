import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useDatosPredio } from '../mapa/useDatosPredio'
import { TIPOS_TRAMPA } from '../trampas/catalogo'

// «Registrar lectura» sin escanear el QR: elegir el lote y la trampa activa (o buscarla por su
// código ICA) abre su formulario de lectura.
export default function SelectorTrampa({ predioId, alCerrar }) {
  const navigate = useNavigate()
  const datos = useDatosPredio(predioId)
  const [loteId, setLoteId] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const texto = busqueda.trim().toLowerCase()
  const activas = datos.trampas.filter(
    (t) =>
      t.estado === 'activa' &&
      (!loteId || t.lote_id === loteId) &&
      (!texto || t.codigo_ica.toLowerCase().includes(texto)),
  )
  const loteDe = (id) => datos.lotes.find((l) => l.id === id)?.codigo ?? ''

  return (
    <section className="tarjeta selector-trampa" aria-labelledby="titulo-selector">
      <div className="ficha__encabezado">
        <h2 id="titulo-selector" className="tarjeta__titulo">
          ¿Qué trampa va a leer?
        </h2>
        <button type="button" className="enlace" onClick={alCerrar}>
          Cerrar
        </button>
      </div>
      <div className="formulario filtro-mtd">
        <div>
          <label htmlFor="selector_lote">Lote</label>
          <select id="selector_lote" value={loteId} onChange={(e) => setLoteId(e.target.value)}>
            <option value="">Todos los lotes</option>
            {datos.lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigo}
                {l.nombre ? ` · ${l.nombre}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="selector_busqueda">Código ICA</label>
          <input
            id="selector_busqueda"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Ej. ICA-0031"
          />
        </div>
      </div>
      {datos.cargando ? (
        <p className="cargando">Cargando trampas…</p>
      ) : activas.length === 0 ? (
        <p className="formulario__nota">No hay trampas activas con ese filtro.</p>
      ) : (
        <ul className="selector-trampa__lista" aria-label="Trampas activas">
          {activas.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="boton-secundario boton-bloque"
                onClick={() => navigate(`/t/${t.codigo_qr}/lectura`)}
              >
                <span className="mono">{t.codigo_ica}</span>
                <span className="selector-trampa__detalle">
                  {TIPOS_TRAMPA[t.tipo].nombre} · Lote {loteDe(t.lote_id)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
