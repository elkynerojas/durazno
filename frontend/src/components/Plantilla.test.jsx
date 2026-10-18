import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ConContextos } from '../test/contextos'
import { PREDIO } from '../test/datos'
import Plantilla from './Plantilla'

vi.mock('./EstadoApi', () => ({ default: () => null }))

const OTRO = { ...PREDIO, id: 'p-2', nombre: 'Finca Alta', vereda: 'La Esperanza' }

function renderizar(rol, { salir = vi.fn(), predios = [PREDIO], seleccionar = vi.fn() } = {}) {
  render(
    <ConContextos
      usuario={{ nombre_completo: 'Ana Ruiz', rol }}
      predios={predios}
      seleccionar={seleccionar}
      salir={salir}
    >
      <MemoryRouter initialEntries={['/lotes']}>
        <Plantilla>
          <p>Contenido</p>
        </Plantilla>
      </MemoryRouter>
    </ConContextos>,
  )
  return { salir, seleccionar }
}

const enlacesDelMenu = () =>
  [...screen.getByRole('navigation', { name: 'Principal' }).querySelectorAll('a')].map(
    (a) => a.textContent,
  )

describe('Plantilla', () => {
  it('al administrador le muestra también Predios y Usuarios', () => {
    renderizar('administrador')
    expect(enlacesDelMenu()).toEqual([
      'Mapa del predio',
      'Lotes',
      'Trampas y QR',
      'Rutas de monitoreo',
      'Planeación',
      'Datos del predio',
      'Predios',
      'Usuarios',
    ])
    expect(screen.getByRole('link', { name: 'Lotes' })).toHaveClass('active')
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })

  it.each(['tecnico', 'productor', 'agronomo'])('al rol %s no le muestra administración', (rol) => {
    renderizar(rol)
    expect(enlacesDelMenu()).not.toContain('Usuarios')
    expect(enlacesDelMenu()).not.toContain('Predios')
  })

  it('«Mi semana» aparece solo a quienes pueden tener actividades asignadas', () => {
    renderizar('tecnico')
    expect(enlacesDelMenu()[0]).toBe('Mi semana')
  })

  it.each(['productor', 'administrador'])('al rol %s no le muestra «Mi semana»', (rol) => {
    renderizar(rol)
    expect(enlacesDelMenu()).not.toContain('Mi semana')
  })

  it('muestra la vereda del predio actual', () => {
    renderizar('tecnico')
    expect(screen.getByText('Icota · Cácota')).toBeInTheDocument()
  })

  it('con varios predios permite cambiar de predio', async () => {
    const { seleccionar } = renderizar('agronomo', { predios: [PREDIO, OTRO] })
    await userEvent.setup().selectOptions(screen.getByLabelText('Predio'), 'p-2')
    expect(seleccionar).toHaveBeenCalledWith('p-2')
  })

  it('con un solo predio no muestra el selector', () => {
    renderizar('agronomo')
    expect(screen.queryByLabelText('Predio')).not.toBeInTheDocument()
  })

  it('muestra la semana ISO y el rol, y cierra la sesión', async () => {
    const { salir } = renderizar('tecnico')
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
