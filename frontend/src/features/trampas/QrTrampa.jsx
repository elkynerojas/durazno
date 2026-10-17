import { useEffect, useState } from 'react'

import { obtenerQrTrampa } from '../../api/client'

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre })
  enlace.click()
  URL.revokeObjectURL(url)
}

// Vista previa del QR de una trampa y descarga en SVG (para imprimir) o PNG.
// Las imágenes se piden con la sesión, por eso no basta un <img src> a la API.
export default function QrTrampa({ trampa }) {
  const [vista, setVista] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let url
    let vigente = true
    obtenerQrTrampa(trampa.id, 'svg')
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
  }, [trampa.id])

  async function bajar(formato) {
    setError(null)
    try {
      descargar(await obtenerQrTrampa(trampa.id, formato), `qr-${trampa.codigo_qr}.${formato}`)
    } catch {
      setError('No se pudo descargar el QR.')
    }
  }

  return (
    <section className="qr-trampa" aria-label="Código QR">
      {vista && <img src={vista} alt={`QR de la trampa ${trampa.codigo_ica}`} />}
      <div>
        <p className="qr-trampa__codigo">{trampa.codigo_qr}</p>
        <div className="qr-trampa__acciones">
          <button type="button" className="boton-secundario" onClick={() => bajar('svg')}>
            Descargar SVG
          </button>
          <button type="button" className="boton-secundario" onClick={() => bajar('png')}>
            Descargar PNG
          </button>
        </div>
      </div>
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
