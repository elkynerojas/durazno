import { useState } from 'react'

import { obtenerEtiquetasLote } from '../../api/client'
import { descargar } from '../../utils/descargas'

// Descarga el PDF de etiquetas QR de las trampas instaladas en el lote, listo para imprimir.
export default function BotonEtiquetas({ lote, className = 'boton-secundario' }) {
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState(null)

  async function imprimir() {
    setGenerando(true)
    setError(null)
    try {
      descargar(await obtenerEtiquetasLote(lote.id), `etiquetas-lote-${lote.codigo}.pdf`)
    } catch (e) {
      setError(e.estado === 409 ? e.message : 'No se pudo generar el PDF de etiquetas.')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <span className="boton-etiquetas">
      <button type="button" className={className} onClick={imprimir} disabled={generando}>
        {generando ? 'Generando PDF…' : 'Imprimir etiquetas del lote'}
      </button>
      {error && (
        <span className="boton-etiquetas__error" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
