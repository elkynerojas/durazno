import { useEffect, useState } from 'react'

import { obtenerQrTrampa } from '../../api/client'
import { descargar } from '../../utils/descargas'
import { TIPOS_TRAMPA } from './catalogo'

// «Etiqueta QR»: vista de la etiqueta como se imprimirá y descarga en PNG o SVG.
// Las imágenes se piden con la sesión, por eso no basta un <img src> a la API.
export default function EtiquetaQr({ trampa, lote, predio }) {
  const [vista, setVista] = useState(null)
  const [error, setError] = useState(null)

  const trampaId = trampa?.id
  useEffect(() => {
    if (!trampaId) return
    let url
    let vigente = true
    obtenerQrTrampa(trampaId, 'svg')
      .then((blob) => {
        if (!vigente) return
        url = URL.createObjectURL(blob)
        setVista(url)
      })
      .catch(() => vigente && setError('No se pudo cargar el QR.'))
    return () => {
      vigente = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [trampaId])

  async function bajar(formato) {
    setError(null)
    try {
      descargar(await obtenerQrTrampa(trampa.id, formato), `qr-${trampa.codigo_qr}.${formato}`)
    } catch {
      setError('No se pudo descargar el QR.')
    }
  }

  return (
    <section aria-labelledby="titulo-etiqueta">
      <h2 id="titulo-etiqueta" className="tarjeta__titulo">
        3 · Etiqueta QR
      </h2>
      <div className="etiqueta-qr">
        <p className="etiqueta-qr__predio">{predio?.nombre ?? 'Predio'} · PNMF</p>
        {trampa && vista ? (
          <img src={vista} alt={`QR de la trampa ${trampa.codigo_ica}`} />
        ) : (
          <div className="etiqueta-qr__vacio">
            {trampa ? 'Cargando…' : 'El QR se genera al guardar la trampa.'}
          </div>
        )}
        <p className="etiqueta-qr__ica">{trampa?.codigo_ica ?? 'ICA-____'}</p>
        <p className="etiqueta-qr__detalle">
          {trampa
            ? `Lote ${lote?.codigo ?? '—'} · ${TIPOS_TRAMPA[trampa.tipo].nombre}`
            : 'Lote · tipo de trampa'}
        </p>
      </div>

      {trampa && (
        <>
          <p className="bloque-codigo">
            Código QR: <strong className="qr-codigo">{trampa.codigo_qr}</strong>
            <br />
            Contenido: …/t/{trampa.codigo_qr}
          </p>
          <div className="grupo-botones">
            <button type="button" className="boton-primario" onClick={() => bajar('png')}>
              Descargar PNG
            </button>
            <button type="button" className="boton-secundario" onClick={() => bajar('svg')}>
              Descargar SVG
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="formulario__error etiqueta-qr__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
