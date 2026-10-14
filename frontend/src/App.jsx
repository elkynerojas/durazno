import EstadoApi from './components/EstadoApi'
import MapaPredio from './components/MapaPredio'

export default function App() {
  return (
    <div className="app">
      <header className="barra">
        <div>
          <h1>Trampeo de moscas de la fruta</h1>
          <p>Cultivo de durazno · Vereda Icota, Cácota</p>
        </div>
        <EstadoApi />
      </header>
      <main className="contenido">
        <MapaPredio />
      </main>
    </div>
  )
}
