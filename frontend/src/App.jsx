import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { ProveedorSesion } from './features/auth/ProveedorSesion'
import InicioSesion from './features/auth/InicioSesion'
import RutaProtegida from './features/auth/RutaProtegida'
import VistaMapa from './features/mapa/VistaMapa'
import VistaUsuarios from './features/usuarios/VistaUsuarios'

export default function App() {
  return (
    <ProveedorSesion>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<InicioSesion />} />
          <Route element={<RutaProtegida />}>
            <Route path="/mapa" element={<VistaMapa />} />
          </Route>
          <Route element={<RutaProtegida roles={['agronomo']} />}>
            <Route path="/usuarios" element={<VistaUsuarios />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ProveedorSesion>
  )
}
