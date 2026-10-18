import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConContextos } from '../../test/contextos'
import { respuestaJson } from '../../test/utilidades'
import VistaPlan from './VistaPlan'

vi.mock('../../components/EstadoApi', () => ({ default: () => null }))

const ACTIVIDAD = {
  id: 'a-1',
  predio_id: 'p-1',
  lote_id: 'l-1',
  lote_codigo: 'L-01',
  tipo: 'visita_monitoreo',
  labor: null,
  tipo_trampa: null,
  ruta_id: 'r-1',
  anio: 2026,
  semana: 42,
  responsable_id: 'u-1',
  responsable_nombre: 'Ana Técnica',
  estado: 'programada',
  serie_id: null,
  notas: null,
}

// La API simulada responde según la ruta pedida.
function simularApi(plan = [ACTIVIDAD]) {
  const fetchSimulado = vi.fn(async (url) => {
    if (url.startsWith('/api/v1/plan')) return respuestaJson(200, plan)
    if (url.startsWith('/api/v1/lotes')) {
      return respuestaJson(200, [{ id: 'l-1', codigo: 'L-01', nombre: null }])
    }
    return respuestaJson(200, [])
  })
  vi.stubGlobal('fetch', fetchSimulado)
  return fetchSimulado
}

function renderizar(rol = 'productor') {
  render(
    <ConContextos usuario={{ nombre_completo: 'Ana', rol }}>
      <MemoryRouter>
        <VistaPlan />
      </MemoryRouter>
    </ConContextos>,
  )
}

describe('VistaPlan', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('muestra las 53 semanas de 2026 con la actividad y su ficha', async () => {
    const fetchSimulado = simularApi()
    const usuarioEvento = userEvent.setup()
    renderizar()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Plan de actividades 2026')
    const celda = await screen.findByRole('button', {
      name: 'Ruta L-01 (Monitoreo · trampeo), semana 42: programada',
    })
    const rejilla = screen.getByRole('region', { name: 'Semanas del año' })
    expect(within(rejilla).getAllByRole('columnheader')).toHaveLength(54)
    expect(within(rejilla).getByRole('columnheader', { name: '42' })).toHaveAttribute(
      'aria-current',
      'date',
    )
    expect(fetchSimulado.mock.calls.map(([url]) => url)).toContain(
      '/api/v1/plan?predio_id=p-1&anio=2026',
    )
    expect(screen.getByRole('heading', { name: /Semana 42 · 12–18 oct 2026/ })).toBeInTheDocument()

    await usuarioEvento.click(celda)
    const ficha = screen.getByRole('region', { name: 'Actividad seleccionada' })
    expect(ficha).toHaveTextContent('Ana Técnica')
    expect(ficha).toHaveTextContent('12–18 oct 2026')
    // El productor solo consulta.
    expect(screen.queryByRole('button', { name: '+ Programar actividad' })).not.toBeInTheDocument()
    expect(within(ficha).queryByRole('button')).not.toBeInTheDocument()
  })

  it('cambia de año y muestra cuando no hay actividades', async () => {
    const fetchSimulado = simularApi([])
    const usuarioEvento = userEvent.setup()
    renderizar('agronomo')

    expect(await screen.findByText(/No hay actividades programadas en 2026/)).toBeInTheDocument()
    await usuarioEvento.click(screen.getByRole('button', { name: 'Año siguiente' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Plan de actividades 2027')
    expect(await screen.findByText(/No hay actividades programadas en 2027/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '52 semanas' })).toBeInTheDocument()
    expect(fetchSimulado.mock.calls.map(([url]) => url)).toContain(
      '/api/v1/plan?predio_id=p-1&anio=2027',
    )
  })
})
