import { useCallback, useEffect, useRef, useState } from 'react'

import { obtenerEvidencia } from '../../api/client'

// Las fotos se piden con la sesión (no basta un <img src> a la API): blob + URL local.
function useImagen(hallazgoId, evidenciaId, miniatura) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let local
    let vigente = true
    obtenerEvidencia(hallazgoId, evidenciaId, miniatura)
      .then((blob) => {
        if (!vigente) return
        local = URL.createObjectURL(blob)
        setUrl(local)
      })
      .catch(() => vigente && setError(true))
    return () => {
      vigente = false
      if (local) URL.revokeObjectURL(local)
    }
  }, [hallazgoId, evidenciaId, miniatura])
  return { url, error }
}

function Miniatura({ hallazgoId, evidencia, numero, alAbrir, alQuitar }) {
  const { url, error } = useImagen(hallazgoId, evidencia.id, true)
  return (
    <li className="miniatura">
      <button
        type="button"
        className="miniatura__abrir"
        onClick={() => alAbrir(evidencia, numero)}
        aria-label={`Ver foto ${numero}`}
      >
        {url ? (
          <img src={url} alt={`Foto ${numero}`} />
        ) : (
          <span className="miniatura__vacia">{error ? 'Sin foto' : '…'}</span>
        )}
      </button>
      {alQuitar && (
        <button
          type="button"
          className="miniatura__quitar"
          onClick={() => alQuitar(evidencia)}
          aria-label={`Eliminar foto ${numero}`}
        >
          ×
        </button>
      )}
    </li>
  )
}

function FotoAmpliada({ hallazgoId, evidencia, numero, alCerrar }) {
  const { url, error } = useImagen(hallazgoId, evidencia.id, false)
  const cerrar = useRef(null)
  useEffect(() => {
    const anterior = document.activeElement
    cerrar.current?.focus()
    const alTeclear = (e) => e.key === 'Escape' && alCerrar()
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('keydown', alTeclear)
      anterior?.focus?.()
    }
  }, [alCerrar])

  return (
    <div className="modal__fondo" onClick={alCerrar}>
      <div
        className="modal modal--foto"
        role="dialog"
        aria-modal="true"
        aria-label={`Foto ${numero}`}
        onClick={(e) => e.stopPropagation()}
      >
        {url && <img src={url} alt={`Foto ${numero} ampliada`} />}
        {!url && <p className="cargando">{error ? 'No se pudo cargar la foto.' : 'Cargando…'}</p>}
        <button ref={cerrar} type="button" className="boton-secundario" onClick={alCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  )
}

// Miniaturas de las fotos de un hallazgo; al tocar una se abre en grande.
export default function GaleriaEvidencias({ hallazgoId, evidencias, alQuitar }) {
  const [abierta, setAbierta] = useState(null)
  const cerrar = useCallback(() => setAbierta(null), [])
  if (evidencias.length === 0) return <p className="formulario__nota">Sin fotos de evidencia.</p>
  return (
    <>
      <ul className="galeria-evidencias" aria-label="Evidencias fotográficas">
        {evidencias.map((e, i) => (
          <Miniatura
            key={e.id}
            hallazgoId={hallazgoId}
            evidencia={e}
            numero={i + 1}
            alAbrir={(evidencia, numero) => setAbierta({ evidencia, numero })}
            alQuitar={alQuitar}
          />
        ))}
      </ul>
      {abierta && (
        <FotoAmpliada
          hallazgoId={hallazgoId}
          evidencia={abierta.evidencia}
          numero={abierta.numero}
          alCerrar={cerrar}
        />
      )}
    </>
  )
}
