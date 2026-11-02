import Encabezado from '../../components/Encabezado'
import Plantilla from '../../components/Plantilla'
import { usePredio } from '../predios/usePredio'
import AdministrarTipos from './AdministrarTipos'

// Inspección (E9, funcionalidad extra): hallazgos del cultivo y su catálogo de tipos.
export default function VistaInspeccion() {
  const { predio } = usePredio()

  return (
    <Plantilla>
      <Encabezado
        migas={[{ texto: predio.nombre, a: '/mapa' }, { texto: 'Inspección' }]}
        titulo="Inspección"
      />
      <AdministrarTipos />
    </Plantilla>
  )
}
