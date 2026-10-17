import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ContextoSesion } from '../features/auth/useSesion'
import Plantilla from './Plantilla'

vi.mock('./EstadoApi', () => ({ default: () => null }))

function renderizar(rol, salir = vi.fn()) {
  render(
    <ContextoSesion.Provider value={{ usuario: { nombre_completo: 'Ana Ruiz', rol }, salir }}>
      <MemoryRouter initialEntries={['/lotes']}>
        <Plantilla>
          <p>Contenido</p>
        </Plantilla>
      </MemoryRouter>
    </ContextoSesion.Provider>,
  )
  return salir
}

describe('Plantilla', () => {
  it('muestra las secciones disponibles y marca la actual', () => {
    renderizar('agronomo')
    const menu = screen.getByRole('navigation', { name: 'Principal' })
    const enlaces = [...menu.querySelectorAll('a')].map((a) => a.textContent)
    expect(enlaces).toEqual(['Mapa del predio', 'Lotes', 'Trampas y QR', 'Predio', 'Usuarios'])
    expect(screen.getByRole('link', { name: 'Lotes' })).toHaveClass('active')
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })

  it.each(['tecnico', 'productor'])('oculta Usuarios al rol %s', (rol) => {
    renderizar(rol)
    expect(screen.getByRole('link', { name: 'Mapa del predio' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('muestra la semana ISO y el rol, y cierra la sesión', async () => {
    const salir = renderizar('tecnico')
    expect(screen.getByText(/^Semana \d{1,2} · /)).toBeInTheDocument()
    expect(screen.getByText('Rol: Técnico')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Salir' }))
    expect(salir).toHaveBeenCalledOnce()
  })

  it('abre y cierra el menú en el teléfono', async () => {
    renderizar('agronomo')
    const boton = screen.getByRole('button', { name: 'Menú' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    await userEvent.setup().click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'true')
  })
})
