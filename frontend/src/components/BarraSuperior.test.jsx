import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ContextoSesion } from '../features/auth/useSesion'
import BarraSuperior from './BarraSuperior'

vi.mock('./EstadoApi', () => ({ default: () => null }))

function renderizar(rol) {
  render(
    <ContextoSesion.Provider value={{ usuario: { nombre_completo: 'Ana', rol }, salir: vi.fn() }}>
      <MemoryRouter>
        <BarraSuperior />
      </MemoryRouter>
    </ContextoSesion.Provider>,
  )
}

describe('BarraSuperior', () => {
  it('muestra Usuarios solo al agrónomo', () => {
    renderizar('agronomo')
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeInTheDocument()
  })

  it.each(['tecnico', 'productor'])('oculta Usuarios al rol %s', (rol) => {
    renderizar(rol)
    expect(screen.getByRole('link', { name: 'Mapa' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  })
})
