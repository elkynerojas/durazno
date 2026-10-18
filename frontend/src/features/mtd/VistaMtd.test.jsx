import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ConContextos } from '../../test/contextos'
import { respuestaBinaria, respuestaJson } from '../../test/utilidades'
import VistaMtd from './VistaMtd'

vi.mock('../../components/EstadoApi', () => ({ default: () => null }))
const descargar = vi.hoisted(() => vi.fn())
vi.mock('../../utils/descargas', () => ({ descargar }))

const fila = (especie, semana, moscas, trampas, dias, mtd, pendientes = 0) => ({
  especie,
  anio: semana === null ? null : 2026,
  semana,
  moscas,
  trampas,
  dias_promedio: dias,
  mtd,
  pendientes,
})

const RESPUESTA = {
  predio_id: 'p-1',
  desde: '2026-10-12',
  hasta: '2026-10-25',
  semanas: [
    fila('capitata', 42, 6, 2, 7, 6 / 14),
    fila('capitata', 43, 0, 1, 7, 0),
    fila('anastrepha', 42, 5, 1, 7, 5 / 7),
    fila('anastrepha', 43, 0, 0, 0, null),
  ],
  periodo: [
    fila('capitata', null, 6, 2, 10.5, 6 / 21, 3),
    fila('anastrepha', null, 5, 1, 7, 5 / 7),
  ],
}

function renderizar() {
  const fetchSimulado = vi.fn(async (url) =>
    url.includes('/reporte.')
      ? respuestaBinaria(200, '%PDF', 'application/pdf')
      : respuestaJson(200, RESPUESTA),
  )
  vi.stubGlobal('fetch', fetchSimulado)
  render(
    <ConContextos usuario={{ nombre_completo: 'Ana', rol: 'productor' }}>
      <MemoryRouter>
        <VistaMtd />
      </MemoryRouter>
    </ConContextos>,
  )
  return fetchSimulado
}

describe('VistaMtd', () => {
  it('muestra el MTD por especie con M, T y D, sin dato y la tendencia', async () => {
    renderizar()
    const capitata = await screen.findByRole('region', { name: 'MTD de Ceratitis capitata' })
    expect(capitata).toHaveTextContent('0,2857')
    expect(capitata).toHaveTextContent('6 ÷ (2 × 10,5) = 0,2857')
    expect(capitata).toHaveTextContent('Incluye 3 lecturas sin validar.')
    const filas = within(capitata).getAllByRole('row').slice(1)
    expect(filas.map((f) => f.textContent)).toEqual([
      'S4319–25 oct 20260170,0000',
      'S4212–18 oct 20266270,4286',
    ])
    expect(within(capitata).getByRole('img')).toHaveAccessibleName(
      'Tendencia del MTD de Ceratitis capitata: 2 de 2 semanas con dato',
    )

    const anastrepha = screen.getByRole('region', { name: 'MTD de Anastrepha spp.' })
    expect(within(anastrepha).getAllByRole('row')[1]).toHaveTextContent('sin dato')
  })

  it('recalcula con el periodo elegido', async () => {
    const fetchSimulado = renderizar()
    const usuarioEvento = userEvent.setup()
    const desde = await screen.findByLabelText('Desde')
    expect(desde).toHaveValue('2026-10-12')
    await usuarioEvento.clear(desde)
    await usuarioEvento.type(desde, '2026-09-01')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Calcular' }))
    expect(fetchSimulado.mock.calls.at(-1)[0]).toBe(
      '/api/v1/mtd?predio_id=p-1&desde=2026-09-01&hasta=2026-10-25',
    )
  })

  it('descarga el reporte para el ICA del periodo calculado', async () => {
    const fetchSimulado = renderizar()
    const usuarioEvento = userEvent.setup()
    await screen.findByRole('region', { name: 'MTD de Ceratitis capitata' })
    // Un cambio sin «Calcular» no cambia el periodo del reporte.
    await usuarioEvento.clear(screen.getByLabelText('Desde'))
    await usuarioEvento.type(screen.getByLabelText('Desde'), '2026-09-01')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Reporte ICA (PDF)' }))
    expect(fetchSimulado.mock.calls.at(-1)[0]).toBe(
      '/api/v1/mtd/reporte.pdf?predio_id=p-1&desde=2026-10-12&hasta=2026-10-25',
    )
    await waitFor(() =>
      expect(descargar).toHaveBeenLastCalledWith(
        expect.any(Blob),
        expect.stringMatching(/^mtd-.+-2026-10-12-2026-10-25\.pdf$/),
      ),
    )
    await usuarioEvento.click(screen.getByRole('button', { name: 'Reporte ICA (CSV)' }))
    expect(fetchSimulado.mock.calls.at(-1)[0]).toBe(
      '/api/v1/mtd/reporte.csv?predio_id=p-1&desde=2026-10-12&hasta=2026-10-25',
    )
  })
})
