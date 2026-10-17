import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { respuestaBinaria, respuestaJson, simularFetch } from '../../test/utilidades'
import BotonEtiquetas from './BotonEtiquetas'

const LOTE = { id: 'l-3', codigo: 'L-03' }

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:pdf'),
    revokeObjectURL: vi.fn(),
  })
})

describe('BotonEtiquetas', () => {
  it('descarga el PDF de etiquetas del lote', async () => {
    const fetchSimulado = simularFetch(respuestaBinaria(200, '%PDF', 'application/pdf'))
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<BotonEtiquetas lote={LOTE} />)

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Imprimir etiquetas del lote' }))

    expect(fetchSimulado.mock.calls[0][0]).toBe('/api/v1/lotes/l-3/etiquetas.pdf')
    expect(clic.mock.contexts[0].download).toBe('etiquetas-lote-L-03.pdf')
  })

  it('avisa si el lote no tiene trampas instaladas', async () => {
    simularFetch(
      respuestaJson(409, { detail: 'El lote L-03 no tiene trampas instaladas para imprimir' }),
    )
    render(<BotonEtiquetas lote={LOTE} />)

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Imprimir etiquetas del lote' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('no tiene trampas instaladas')
    expect(screen.getByRole('button', { name: 'Imprimir etiquetas del lote' })).toBeEnabled()
  })
})
