import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import TablaTrampas from './TablaTrampas'

const TRAMPA = {
  id: 't-1',
  codigo_ica: 'ICA-0031',
  codigo_qr: 'ABCD2345',
  tipo: 'jackson',
  atrayente: 'Trimedlure',
  fecha_instalacion: '2026-09-03',
  estado: 'retirada',
  geom: { type: 'Point', coordinates: [-72.64021, 7.27184] },
}

describe('TablaTrampas', () => {
  it('muestra tipo, coordenadas en [lat, lng], fecha, QR y estado', async () => {
    const alSeleccionar = vi.fn()
    render(
      <TablaTrampas
        titulo="Trampas del lote L-03"
        trampas={[TRAMPA]}
        alSeleccionar={alSeleccionar}
      />,
    )
    const fila = screen.getByText('ICA-0031').closest('tr')
    expect(
      within(fila)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual([
      'ICA-0031',
      'Jackson + trimedlure',
      '7.27184, -72.64021',
      '03/09/2026',
      'ABCD2345',
      'Retirada',
      'Ver ficha',
    ])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ver ficha de ICA-0031' }))
    expect(alSeleccionar).toHaveBeenCalledWith(TRAMPA)
  })

  it('avisa cuando no hay trampas', () => {
    render(<TablaTrampas titulo="Trampas del predio" trampas={[]} alSeleccionar={vi.fn()} />)
    expect(screen.getByText('Aún no hay trampas registradas.')).toBeInTheDocument()
  })
})
