import EstadoApi from '../../components/EstadoApi'
import MapaPredio from '../../components/MapaPredio'
import { useSesion } from '../auth/useSesion'

export default function VistaMapa() {
  const { usuario, salir } = useSesion()

  return (
    <div className="app">
      <header className="barra">
        <div>
          <h1>Trampeo de moscas de la fruta</h1>
          <p>Cultivo de durazno · Vereda Icota, Cácota</p>
        </div>
        <div className="barra__acciones">
          <EstadoApi />
          <span className="barra__usuario">{usuario.nombre_completo}</span>
          <button type="button" className="boton-secundario" onClick={salir}>
            Salir
          </button>
        </div>
      </header>
      <main className="contenido">
        <MapaPredio />
      </main>
    </div>
  )
}
