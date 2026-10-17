import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { respuestaBinaria, respuestaJson, simularFetch } from '../../test/utilidades'
import QrTrampa from './QrTrampa'

const TRAMPA = { id: 't-1', codigo_ica: 'ICA-001', codigo_qr: 'ABCD2345' }

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:qr'),
    revokeObjectURL: vi.fn(),
  })
})

describe('QrTrampa', () => {
  it('muestra la vista previa y el código corto', async () => {
    const fetchSimulado = simularFetch(respuestaBinaria(200, '<svg/>', 'image/svg+xml'))
    render(<QrTrampa trampa={TRAMPA} />)

    expect(await screen.findByRole('img', { name: 'QR de la trampa ICA-001' })).toHaveAttribute(
      'src',
      'blob:qr',
    )
    expect(screen.getByText('ABCD2345')).toBeInTheDocument()
    expect(fetchSimulado.mock.calls[0][0]).toBe('/api/v1/trampas/t-1/qr.svg')
  })

  it('descarga el PNG con el código en el nombre', async () => {
    const fetchSimulado = simularFetch(
      respuestaBinaria(200, '<svg/>', 'image/svg+xml'),
      respuestaBinaria(200, 'png', 'image/png'),
    )
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const usuarioEvento = userEvent.setup()
    render(<QrTrampa trampa={TRAMPA} />)

    await usuarioEvento.click(screen.getByRole('button', { name: 'Descargar PNG' }))

    expect(fetchSimulado.mock.calls[1][0]).toBe('/api/v1/trampas/t-1/qr.png')
    expect(clic).toHaveBeenCalledOnce()
    expect(clic.mock.contexts[0].download).toBe('qr-ABCD2345.png')
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('avisa si la descarga falla', async () => {
    simularFetch(
      respuestaBinaria(200, '<svg/>', 'image/svg+xml'),
      respuestaJson(404, { detail: 'Trampa no encontrada' }),
    )
    const usuarioEvento = userEvent.setup()
    render(<QrTrampa trampa={TRAMPA} />)

    await usuarioEvento.click(screen.getByRole('button', { name: 'Descargar SVG' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo descargar el QR.')
  })
})
