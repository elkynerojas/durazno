import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ListaParadas from './ListaParadas'

const trampa = (id, codigo_ica, tipo = 'jackson') => ({ id, codigo_ica, tipo })
const PARADAS = [
  { trampa: trampa('t1', 'ICA-01'), distancia: null },
  { trampa: trampa('t2', 'ICA-02', 'mcphail'), distancia: 120.4 },
  { trampa: trampa('t3', 'ICA-03'), distancia: 95 },
]

describe('ListaParadas', () => {
  it('muestra el orden con el tipo y la distancia de cada tramo', () => {
    render(<ListaParadas paradas={PARADAS} editable alCambiar={vi.fn()} />)
    const items = within(screen.getByRole('list', { name: 'Orden de visita' })).getAllByRole(
      'listitem',
    )
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('1ICA-01Jackson'),
      expect.stringContaining('2ICA-02McPhail · 120 m'),
      expect.stringContaining('3ICA-03Jackson · 95 m'),
    ])
  })

  it('las flechas suben y bajan una trampa', async () => {
    const alCambiar = vi.fn()
    const usuarioEvento = userEvent.setup()
    render(<ListaParadas paradas={PARADAS} editable alCambiar={alCambiar} />)

    expect(screen.getByRole('button', { name: 'Subir ICA-01' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bajar ICA-03' })).toBeDisabled()
    await usuarioEvento.click(screen.getByRole('button', { name: 'Subir ICA-03' }))
    expect(alCambiar).toHaveBeenLastCalledWith(['t1', 't3', 't2'])
    await usuarioEvento.click(screen.getByRole('button', { name: 'Bajar ICA-01' }))
    expect(alCambiar).toHaveBeenLastCalledWith(['t2', 't1', 't3'])
  })

  it('sin permiso solo muestra el orden', () => {
    render(<ListaParadas paradas={PARADAS} editable={false} alCambiar={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
