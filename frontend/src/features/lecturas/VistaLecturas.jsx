import { useEffect, useState } from 'react'

import { lecturasDelPredio, revisarLectura } from '../../api/client'
import Encabezado from '../../components/Encabezado'
import Plantilla from '../../components/Plantilla'
import { useSesion } from '../auth/useSesion'
import { usePredio } from '../predios/usePredio'
import { ROLES_GESTION } from '../usuarios/roles'
import TarjetaRevision from './TarjetaRevision'

const PESTANAS = [
  ['registrada', 'Pendientes'],
  ['validada', 'Validadas'],
  ['rechazada', 'Rechazadas'],
]

// Bandeja de validación de lecturas (HU-26): las pendientes primero, con avisos de las tomadas
// lejos de la trampa, sin ubicación o con los días de exposición cambiados.
export default function VistaLecturas() {
  const { usuario } = useSesion()
  const editable = ROLES_GESTION.includes(usuario.rol)
  const { predio } = usePredio()
  const [estado, setEstado] = useState('registrada')
  const [respuesta, setRespuesta] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [validando, setValidando] = useState(false)

  useEffect(() => {
    let vigente = true
    lecturasDelPredio(predio.id, estado)
      .then((lista) => vigente && setRespuesta({ estado, lista }))
      .catch(() => vigente && setError('No se pudieron cargar las lecturas.'))
    return () => {
      vigente = false
    }
  }, [predio.id, estado])

  const lecturas = respuesta?.estado === estado ? respuesta.lista : null
  const sinAvisos = (lecturas ?? []).filter((l) => l.avisos.length === 0)

  // Una revisión saca la lectura de la pestaña actual (cambió de estado).
  function alRevisar(revisada) {
    setRespuesta((r) => ({ ...r, lista: r.lista.filter((l) => l.id !== revisada.id) }))
    setAviso(
      `Lectura de ${revisada.trampa_codigo_ica} ${revisada.estado === 'validada' ? 'validada' : 'rechazada'}.`,
    )
  }

  async function validarSinAvisos() {
    setValidando(true)
    setError(null)
    let validadas = 0
    try {
      for (const lectura of sinAvisos) {
        await revisarLectura(lectura.id, { estado: 'validada', estado_esperado: lectura.estado })
        validadas += 1
      }
    } catch {
      setError('Algunas lecturas no se pudieron validar. Revise la lista.')
    }
    setRespuesta((r) => ({
      ...r,
      lista: r.lista.filter(
        (l) => l.avisos.length > 0 || !sinAvisos.slice(0, validadas).includes(l),
      ),
    }))
    setAviso(`${validadas} ${validadas === 1 ? 'lectura validada' : 'lecturas validadas'}.`)
    setValidando(false)
  }

  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: predio.nombre, a: '/mapa' }, { texto: 'Lecturas' }]}
        titulo="Lecturas de trampa"
      >
        {editable && estado === 'registrada' && sinAvisos.length > 0 && (
          <button
            type="button"
            className="boton-primario"
            disabled={validando}
            onClick={validarSinAvisos}
          >
            {validando
              ? 'Validando…'
              : `Validar ${sinAvisos.length === 1 ? 'la 1' : `las ${sinAvisos.length}`} sin avisos`}
          </button>
        )}
      </Encabezado>
      <div className="grupo-botones pestanas" role="group" aria-label="Estado">
        {PESTANAS.map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            className="boton-secundario"
            aria-pressed={estado === valor}
            onClick={() => {
              setEstado(valor)
              setAviso(null)
            }}
          >
            {texto}
            {estado === valor && lecturas && ` (${lecturas.length})`}
          </button>
        ))}
      </div>
      {aviso && (
        <p className="formulario__exito" role="status">
          {aviso}
        </p>
      )}
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      {lecturas === null && !error && <p className="cargando">Cargando lecturas…</p>}
      {lecturas?.length === 0 && (
        <section className="tarjeta">
          <p>
            {estado === 'registrada'
              ? 'No hay lecturas pendientes de validar.'
              : 'No hay lecturas en este estado.'}
          </p>
        </section>
      )}
      {lecturas?.length > 0 && (
        <ul className="mi-semana" aria-label="Lecturas">
          {lecturas.map((lectura) => (
            <TarjetaRevision
              key={lectura.id}
              lectura={lectura}
              editable={editable}
              alRevisar={alRevisar}
            />
          ))}
        </ul>
      )}
    </Plantilla>
  )
}
