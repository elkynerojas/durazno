import Plantilla from '../../components/Plantilla'
import SinPredio from './SinPredio'
import { usePredio } from './usePredio'

// Vistas que trabajan sobre el predio actual: sin predio muestran el aviso, y al cambiar de
// predio se vuelven a montar (estado limpio y mapa encuadrado en el predio nuevo).
export default function PorPredio({ children }) {
  const { predio } = usePredio()
  if (!predio) {
    return (
      <Plantilla>
        <SinPredio />
      </Plantilla>
    )
  }
  return (
    <div key={predio.id} className="por-predio">
      {children}
    </div>
  )
}
