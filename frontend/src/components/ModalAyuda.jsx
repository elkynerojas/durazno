import { useEffect, useRef, useState } from 'react'

import { obtenerSalud } from '../api/client'
import { VERSION } from '../version'
import Logo from './Logo'

export const MANUAL_PDF = '/manual-usuario.pdf'
const ANIO = 2026

// «Ayuda» del menú: versión del aplicativo y de la API, créditos y el manual de usuario en PDF.
// Se cierra con Esc, con «Cerrar» o tocando fuera; al cerrar, el foco vuelve a «Ayuda».
export default function ModalAyuda({ alCerrar }) {
  const cerrar = useRef(null)
  const [api, setApi] = useState(null)

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

  useEffect(() => {
    let vigente = true
    obtenerSalud()
      .then((s) => vigente && setApi(s.version ?? null))
      .catch(() => vigente && setApi(false))
    return () => {
      vigente = false
    }
  }, [])

  return (
    <div className="modal__fondo" onClick={alCerrar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-ayuda"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__marca">
          <Logo className="marca__logo modal__logo" />
          <div>
            <h2 id="titulo-ayuda">Ayuda</h2>
            <p className="formulario__nota">
              PERSICA · Trazabilidad geolocalizada del trampeo de moscas de la fruta en el cultivo
              de durazno.
            </p>
          </div>
        </div>

        <dl className="ficha__datos">
          <dt>Versión</dt>
          <dd>{VERSION}</dd>
          <dt>Servicios (API)</dt>
          <dd>{api === null ? 'Consultando…' : api === false ? 'Sin conexión' : api}</dd>
        </dl>

        <a
          className="boton-primario boton-bloque"
          href={MANUAL_PDF}
          target="_blank"
          rel="noopener noreferrer"
        >
          Manual de usuario (PDF)
        </a>

        <p className="modal__copyright">
          © {ANIO} Luis e Ingry · Trabajo de grado, Semillero ORION · Instituto Superior de
          Educación Rural (ISER). Todos los derechos reservados.
        </p>

        <div className="formulario__acciones">
          <button ref={cerrar} type="button" className="boton-secundario" onClick={alCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
