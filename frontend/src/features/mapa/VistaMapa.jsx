import BarraSuperior from '../../components/BarraSuperior'
import MapaPredio from '../../components/MapaPredio'

export default function VistaMapa() {
  return (
    <div className="app">
      <BarraSuperior />
      <main className="contenido">
        <MapaPredio />
      </main>
    </div>
  )
}
