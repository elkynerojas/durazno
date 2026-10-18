import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { ProveedorSesion } from './features/auth/ProveedorSesion'
import InicioSesion from './features/auth/InicioSesion'
import RutaProtegida from './features/auth/RutaProtegida'
import PorPredio from './features/predios/PorPredio'
import { ProveedorPredio } from './features/predios/ProveedorPredio'
import VistaLectura from './features/lecturas/VistaLectura'
import VistaLecturas from './features/lecturas/VistaLecturas'
import VistaLotes from './features/lotes/VistaLotes'
import VistaMapa from './features/mapa/VistaMapa'
import VistaMiSemana from './features/plan/VistaMiSemana'
import VistaPlan from './features/plan/VistaPlan'
import VistaPredio from './features/predio/VistaPredio'
import VistaPredios from './features/predios/VistaPredios'
import VistaRutas from './features/rutas/VistaRutas'
import VistaFichaTrampa from './features/trampas/VistaFichaTrampa'
import VistaTrampas from './features/trampas/VistaTrampas'
import VistaUsuarios from './features/usuarios/VistaUsuarios'

export default function App() {
  return (
    <ProveedorSesion>
      <ProveedorPredio>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<InicioSesion />} />
            <Route element={<RutaProtegida />}>
              <Route
                path="/mapa"
                element={
                  <PorPredio>
                    <VistaMapa />
                  </PorPredio>
                }
              />
              <Route
                path="/lotes"
                element={
                  <PorPredio>
                    <VistaLotes />
                  </PorPredio>
                }
              />
              <Route
                path="/trampas"
                element={
                  <PorPredio>
                    <VistaTrampas />
                  </PorPredio>
                }
              />
              <Route
                path="/rutas"
                element={
                  <PorPredio>
                    <VistaRutas />
                  </PorPredio>
                }
              />
              <Route
                path="/plan"
                element={
                  <PorPredio>
                    <VistaPlan />
                  </PorPredio>
                }
              />
              <Route path="/mi-semana" element={<VistaMiSemana />} />
              <Route
                path="/lecturas"
                element={
                  <PorPredio>
                    <VistaLecturas />
                  </PorPredio>
                }
              />
              <Route path="/t/:codigo" element={<VistaFichaTrampa />} />
              <Route path="/t/:codigo/lectura" element={<VistaLectura />} />
              <Route
                path="/predio"
                element={
                  <PorPredio>
                    <VistaPredio />
                  </PorPredio>
                }
              />
            </Route>
            <Route element={<RutaProtegida roles={['administrador']} />}>
              <Route path="/usuarios" element={<VistaUsuarios />} />
              <Route path="/predios" element={<VistaPredios />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ProveedorPredio>
    </ProveedorSesion>
  )
}
