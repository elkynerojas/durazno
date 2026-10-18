import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ConContextos } from '../../test/contextos'
import { PREDIO } from '../../test/datos'
import { respuestaJson } from '../../test/utilidades'
import VistaPredio from './VistaPredio'

vi.mock('../../components/EstadoApi', () => ({ default: () => null }))
// Leaflet no se prueba en jsdom: el mapa del límite queda fuera (lo cubre la E2E).
vi.mock('../../components/MapaPredio', () => ({ default: () => <div>Mapa</div> }))
vi.mock('../lotes/CapaLotes', () => ({ default: () => null }))
vi.mock('../lotes/EditorPoligono', () => ({ default: () => null }))

function renderizar(rol, predios = [PREDIO]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => respuestaJson(200, [])),
  )
  render(
    <ConContextos
      usuario={{ nombre_completo: 'Ana', rol }}
      predio={predios[0] ?? null}
      predios={predios}
    >
      <MemoryRouter>
        <VistaPredio />
      </MemoryRouter>
    </ConContextos>,
  )
}

describe('VistaPredio', () => {
  it('el administrador ve el predio actual, su personal y todos los predios', async () => {
    renderizar('administrador')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Predio')
    expect(screen.getByRole('form', { name: 'Datos del predio' })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: `Personal de ${PREDIO.nombre}` }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Todos los predios' })).toBeInTheDocument()
  })

  it('el agrónomo ve solo los datos de su predio', () => {
    renderizar('agronomo')
    expect(screen.getByRole('form', { name: 'Datos del predio' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Personal de/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Todos los predios' })).not.toBeInTheDocument()
  })

  it('el administrador sin predios puede crear el primero', () => {
    renderizar('administrador', [])
    expect(screen.getByText('Aún no hay predios. Cree el primero.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Nuevo predio' })).toBeInTheDocument()
  })

  it('a los demás roles sin predios les explica que pidan la asignación', () => {
    renderizar('tecnico', [])
    expect(screen.getByText(/No tiene predios asignados/)).toBeInTheDocument()
  })
})
