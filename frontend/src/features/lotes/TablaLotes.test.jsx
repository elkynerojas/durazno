import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import TablaLotes from './TablaLotes'

const GEOM = {
  type: 'Polygon',
  coordinates: [
    [
      [-72.64, 7.27],
      [-72.639, 7.27],
      [-72.639, 7.271],
      [-72.64, 7.27],
    ],
  ],
}
const LOTES = [
  {
    id: 'l-1',
    codigo: 'L-01',
    nombre: 'Del río',
    area_ha: 1.86,
    geom: GEOM,
    updated_at: '2026-09-02T10:00:00Z',
  },
  {
    id: 'l-2',
    codigo: 'L-02',
    nombre: null,
    area_ha: 1.64,
    geom: GEOM,
    updated_at: '2026-09-03T10:00:00Z',
  },
]
const TRAMPAS = [{ lote_id: 'l-1' }, { lote_id: 'l-1' }]

describe('TablaLotes', () => {
  it('lista área, vértices, trampas y fecha de cada lote', () => {
    render(<TablaLotes lotes={LOTES} trampas={TRAMPAS} alSeleccionar={vi.fn()} editable />)
    const fila = screen.getByText('L-01').closest('tr')
    expect(
      within(fila)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['L-01', 'Del río', '1,86 ha', '3', '2', '02/09/2026', 'Editar'])
  })

  it('filtra por código o nombre y elige un lote', async () => {
    const alSeleccionar = vi.fn()
    const usuarioEvento = userEvent.setup()
    render(<TablaLotes lotes={LOTES} trampas={[]} alSeleccionar={alSeleccionar} editable />)

    await usuarioEvento.type(screen.getByRole('searchbox', { name: 'Buscar lote' }), 'río')
    expect(screen.queryByText('L-02')).not.toBeInTheDocument()
    await usuarioEvento.click(screen.getByRole('button', { name: 'Editar lote L-01' }))
    expect(alSeleccionar).toHaveBeenCalledWith(LOTES[0])

    await usuarioEvento.clear(screen.getByRole('searchbox', { name: 'Buscar lote' }))
    await usuarioEvento.type(screen.getByRole('searchbox', { name: 'Buscar lote' }), 'zzz')
    expect(screen.getByText('Ningún lote coincide.')).toBeInTheDocument()
  })
})
