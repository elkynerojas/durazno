import { useState } from 'react'

import { exportarPredio } from '../../api/client'
import { descargar } from '../../utils/descargas'

const FORMATOS = [
  { formato: 'geojson', texto: 'GeoJSON', extension: 'geojson' },
  { formato: 'kml', texto: 'KML', extension: 'kml' },
]

// Descarga los lotes y trampas (de todo el predio o de un lote) para QGIS o Google Earth.
export default function BotonesExportar({ lote }) {
  const [error, setError] = useState(null)

  async function exportar({ formato, extension }) {
    setError(null)
    try {
      const nombre = lote ? `lote-${lote.codigo}` : 'predio-icota'
      descargar(await exportarPredio(formato, lote?.id), `${nombre}.${extension}`)
    } catch {
      setError('No se pudo exportar. Intente de nuevo.')
    }
  }

  return (
    <>
      {FORMATOS.map((f) => (
        <button
          key={f.formato}
          type="button"
          className="boton-secundario"
          onClick={() => exportar(f)}
        >
          {lote ? `Lote en ${f.texto}` : `Exportar ${f.texto}`}
        </button>
      ))}
      {error && (
        <span className="boton-etiquetas__error" role="alert">
          {error}
        </span>
      )}
    </>
  )
}
