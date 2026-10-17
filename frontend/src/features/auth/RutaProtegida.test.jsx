import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import RutaProtegida from './RutaProtegida'
import { ContextoSesion } from './useSesion'

function renderizar(sesion, ruta = '/mapa') {
  render(
    <ContextoSesion.Provider value={sesion}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/" element={<p>Inicio de sesión</p>} />
          <Route element={<RutaProtegida />}>
            <Route path="/mapa" element={<p>Vista del mapa</p>} />
          </Route>
          <Route element={<RutaProtegida roles={['agronomo']} />}>
            <Route path="/usuarios" element={<p>Vista de usuarios</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ContextoSesion.Provider>,
  )
}

describe('RutaProtegida', () => {
  it('redirige al inicio sin sesión', () => {
    renderizar({ usuario: null, cargando: false })
    expect(screen.getByText('Inicio de sesión')).toBeInTheDocument()
  })

  it('muestra la vista con sesión', () => {
    renderizar({ usuario: { nombre_completo: 'Ana' }, cargando: false })
    expect(screen.getByText('Vista del mapa')).toBeInTheDocument()
  })

  it('espera mientras se recupera la sesión', () => {
    renderizar({ usuario: null, cargando: true })
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
  })

  it('envía al mapa si el rol no tiene acceso a la vista', () => {
    renderizar({ usuario: { rol: 'tecnico' }, cargando: false }, '/usuarios')
    expect(screen.getByText('Vista del mapa')).toBeInTheDocument()
  })

  it('muestra la vista restringida al rol permitido', () => {
    renderizar({ usuario: { rol: 'agronomo' }, cargando: false }, '/usuarios')
    expect(screen.getByText('Vista de usuarios')).toBeInTheDocument()
  })
})
