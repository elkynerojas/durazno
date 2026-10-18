import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConContextos } from '../../test/contextos'
import { PREDIO } from '../../test/datos'
import { respuestaJson } from '../../test/utilidades'
import VistaMiSemana from './VistaMiSemana'

vi.mock('../../components/EstadoApi', () => ({ default: () => null }))

const actividad = (id, extra) => ({
  id,
  predio_id: 'p-2',
  predio_nombre: 'Finca Alta',
  lote_id: 'l-3',
  lote_codigo: 'L-03',
  labor: null,
  tipo_trampa: null,
  ruta_id: null,
  ruta_paradas: null,
  anio: 2026,
  semana: 42,
  estado: 'programada',
  notas: null,
  ...extra,
})

const SEMANA_42 = {
  anio: 2026,
  semana: 42,
  desde: '2026-10-12',
  hasta: '2026-10-18',
  actividades: [
    actividad('a-1', { tipo: 'visita_monitoreo', ruta_id: 'r-1', ruta_paradas: 6 }),
    actividad('a-2', {
      tipo: 'cambio_atrayente',
      tipo_trampa: 'jackson',
      notas: 'Llevar trimedlure',
    }),
  ],
}

function simularApi() {
  const fetchSimulado = vi.fn(async (url) =>
    respuestaJson(
      200,
      url.includes('semana=42') ? SEMANA_42 : { ...SEMANA_42, semana: 43, actividades: [] },
    ),
  )
  vi.stubGlobal('fetch', fetchSimulado)
  return fetchSimulado
}

function renderizar(seleccionar = vi.fn()) {
  render(
    <ConContextos
      usuario={{ nombre_completo: 'Ana', rol: 'tecnico' }}
      predios={[PREDIO, { ...PREDIO, id: 'p-2', nombre: 'Finca Alta' }]}
      seleccionar={seleccionar}
    >
      <MemoryRouter initialEntries={['/mi-semana']}>
        <Routes>
          <Route path="/mi-semana" element={<VistaMiSemana />} />
          <Route path="/rutas" element={<p>Vista de rutas</p>} />
        </Routes>
      </MemoryRouter>
    </ConContextos>,
  )
  return seleccionar
}

describe('VistaMiSemana', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('lista las actividades de la semana con lote, predio y ruta', async () => {
    const fetchSimulado = simularApi()
    renderizar()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mi semana')
    expect(
      screen.getByText('Semana 42 · 12–18 oct 2026', { selector: '.mi-semana__rango' }),
    ).toBeInTheDocument()
    const lista = await screen.findByRole('list', { name: 'Actividades de la semana' })
    const [visita, recambio] = within(lista).getAllByRole('listitem')
    expect(visita).toHaveTextContent('Ruta L-03')
    expect(visita).toHaveTextContent('Lote L-03 · Finca Alta · ruta de 6 trampas')
    expect(recambio).toHaveTextContent('Recambio trimedlure')
    expect(recambio).toHaveTextContent('Llevar trimedlure')
    expect(fetchSimulado.mock.calls[0][0]).toBe('/api/v1/plan/mias?anio=2026&semana=42')
  })

  it('abre la ruta en el mapa en el predio de la actividad', async () => {
    simularApi()
    const seleccionar = renderizar()
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Ver la ruta en el mapa' }))
    expect(seleccionar).toHaveBeenCalledWith('p-2')
    expect(screen.getByText('Vista de rutas')).toBeInTheDocument()
  })

  it('pasa a la semana siguiente y vuelve a la actual', async () => {
    const fetchSimulado = simularApi()
    const usuarioEvento = userEvent.setup()
    renderizar()
    await screen.findByRole('list', { name: 'Actividades de la semana' })

    await usuarioEvento.click(screen.getByRole('button', { name: 'Semana siguiente' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Semana 43')
    expect(
      await screen.findByText('No tiene actividades asignadas en esa semana.'),
    ).toBeInTheDocument()
    expect(fetchSimulado.mock.calls.at(-1)[0]).toBe('/api/v1/plan/mias?anio=2026&semana=43')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Esta semana' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mi semana')
  })
})
