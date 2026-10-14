import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { ProveedorSesion } from './features/auth/ProveedorSesion'
import InicioSesion from './features/auth/InicioSesion'
import RutaProtegida from './features/auth/RutaProtegida'
import VistaMapa from './features/mapa/VistaMapa'

export default function App() {
  return (
    <ProveedorSesion>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<InicioSesion />} />
          <Route element={<RutaProtegida />}>
            <Route path="/mapa" element={<VistaMapa />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ProveedorSesion>
  )
}
