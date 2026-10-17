import Encabezado from '../../components/Encabezado'
import Plantilla from '../../components/Plantilla'
import { useSesion } from '../auth/useSesion'
import FormularioPredio from '../predios/FormularioPredio'
import { usePredio } from '../predios/usePredio'
import { ROLES_GESTION } from '../usuarios/roles'

// Datos del predio actual: el agrónomo asignado o el administrador los editan.
export default function VistaPredio() {
  const { usuario } = useSesion()
  const { predio, recargar } = usePredio()
  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: predio.nombre, a: '/mapa' }, { texto: 'Datos del predio' }]}
        titulo="Datos del predio"
      />
      <div className="contenido-angosto">
        <section className="tarjeta">
          <FormularioPredio
            predio={predio}
            editable={ROLES_GESTION.includes(usuario.rol)}
            alGuardar={recargar}
          />
        </section>
      </div>
    </Plantilla>
  )
}
