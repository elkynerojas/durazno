import { useEffect, useState } from 'react'

import { obtenerSalud } from '../api/client'

// Indicador de conexión con la API y PostGIS (útil para verificar el entorno Docker).
export default function EstadoApi() {
  const [estado, setEstado] = useState({ tipo: 'cargando', texto: 'Conectando…' })

  useEffect(() => {
    obtenerSalud()
      .then((s) =>
        setEstado(
          s.base_datos === 'ok'
            ? { tipo: 'ok', texto: `API ok · PostGIS ${s.postgis}` }
            : { tipo: 'aviso', texto: 'API ok · base de datos sin conexión' },
        ),
      )
      .catch(() => setEstado({ tipo: 'error', texto: 'API sin conexión' }))
  }, [])

  return (
    <span className={`estado estado--${estado.tipo}`} role="status">
      {estado.texto}
    </span>
  )
}
