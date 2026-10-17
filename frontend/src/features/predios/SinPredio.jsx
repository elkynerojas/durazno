import { Link } from 'react-router'

import { useSesion } from '../auth/useSesion'
import { usePredio } from './usePredio'

// Aviso cuando el usuario aún no tiene predios (o mientras se cargan).
export default function SinPredio() {
  const { usuario } = useSesion()
  const { cargando, error } = usePredio()
  if (cargando) return <p className="cargando">Cargando predios…</p>
  return (
    <section className="tarjeta contenido-angosto">
      <h2 className="tarjeta__titulo">Sin predio</h2>
      {error ? (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      ) : usuario.rol === 'administrador' ? (
        <p>
          Aún no hay predios registrados. <Link to="/predios">Cree el primero</Link>.
        </p>
      ) : (
        <p>No tiene predios asignados. Pida al administrador que lo asigne a un predio.</p>
      )}
    </section>
  )
}
