import { useState } from 'react'

import { contarVertices } from '../../utils/geo'
import { fechaCorta } from '../../utils/fechas'
import { formatoHa } from '../../utils/formato'

// «Lotes registrados» con búsqueda por código o nombre.
export default function TablaLotes({ lotes, trampas, seleccionadoId, alSeleccionar, editable }) {
  const [busqueda, setBusqueda] = useState('')
  const texto = busqueda.trim().toLowerCase()
  const visibles = lotes.filter(
    (l) => !texto || `${l.codigo} ${l.nombre ?? ''}`.toLowerCase().includes(texto),
  )
  const trampasPorLote = trampas.reduce(
    (cuenta, t) => cuenta.set(t.lote_id, (cuenta.get(t.lote_id) ?? 0) + 1),
    new Map(),
  )

  return (
    <section className="tarjeta tarjeta--sin-relleno" aria-labelledby="titulo-lotes">
      <div className="tarjeta__cabecera">
        <h2 id="titulo-lotes" className="tarjeta__titulo">
          Lotes registrados
        </h2>
        <input
          type="search"
          className="campo-busqueda"
          placeholder="Buscar lote…"
          aria-label="Buscar lote"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>
      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Código</th>
              <th className="tabla__secundaria">Nombre</th>
              <th>Área</th>
              <th className="tabla__secundaria">Vértices</th>
              <th>Trampas</th>
              <th className="tabla__secundaria">Actualizado</th>
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((lote) => (
              <tr
                key={lote.id}
                className={lote.id === seleccionadoId ? 'tabla__seleccionada' : undefined}
              >
                <td className="mono">{lote.codigo}</td>
                <td className="tabla__secundaria">{lote.nombre ?? '—'}</td>
                <td>{formatoHa.format(lote.area_ha)} ha</td>
                <td className="tabla__secundaria">{contarVertices(lote.geom)}</td>
                <td>{trampasPorLote.get(lote.id) ?? 0}</td>
                <td className="tabla__secundaria">{fechaCorta(lote.updated_at)}</td>
                <td>
                  <button
                    type="button"
                    className="enlace"
                    onClick={() => alSeleccionar(lote)}
                    aria-label={`${editable ? 'Editar' : 'Ver'} lote ${lote.codigo}`}
                  >
                    {editable ? 'Editar' : 'Ver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <p className="tabla__vacia">
            {lotes.length === 0 ? 'Aún no hay lotes registrados.' : 'Ningún lote coincide.'}
          </p>
        )}
      </div>
    </section>
  )
}
