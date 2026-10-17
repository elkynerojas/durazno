import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { respuestaBinaria, respuestaJson, simularFetch } from '../../test/utilidades'
import ReponerEtiqueta from './ReponerEtiqueta'

const TRAMPA = { id: 't-1', codigo_qr: 'VEJA2345', estado: 'activa' }
const HISTORIAL = [
  {
    id: 'r-1',
    codigo_anterior: 'ABCD2345',
    codigo_nuevo: 'VEJA2345',
    motivo: 'Rota',
    responsable: 'Ana Ruiz',
    created_at: '2026-10-10T15:30:00Z',
  },
]

beforeEach(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
})

describe('ReponerEtiqueta', () => {
  it('reimprime la etiqueta con el mismo código', async () => {
    const fetchSimulado = simularFetch(
      respuestaJson(200, []),
      respuestaBinaria(200, '%PDF', 'application/pdf'),
    )
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<ReponerEtiqueta trampa={TRAMPA} puedeReemplazar alReemplazar={vi.fn()} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reimprimir etiqueta' }))

    expect(fetchSimulado.mock.calls[1][0]).toBe('/api/v1/trampas/t-1/etiqueta.pdf')
    expect(clic.mock.contexts[0].download).toBe('etiqueta-VEJA2345.pdf')
  })

  it('reemplaza tras confirmar, con motivo e id del cliente', async () => {
    const nueva = { ...TRAMPA, codigo_qr: 'NUEV2345' }
    const fetchSimulado = simularFetch(
      respuestaJson(200, []),
      respuestaJson(200, nueva),
      respuestaJson(200, HISTORIAL),
    )
    const alReemplazar = vi.fn()
    const usuarioEvento = userEvent.setup()
    render(<ReponerEtiqueta trampa={TRAMPA} puedeReemplazar alReemplazar={alReemplazar} />)

    await usuarioEvento.click(screen.getByRole('button', { name: 'Reemplazar etiqueta' }))
    expect(screen.getByText(/la etiqueta VEJA2345 dejará de servir/)).toBeInTheDocument()
    await usuarioEvento.type(screen.getByLabelText('Motivo (opcional)'), 'Borrosa')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Confirmar reemplazo' }))

    expect(alReemplazar).toHaveBeenCalledWith(nueva)
    const [url, opciones] = fetchSimulado.mock.calls[1]
    expect([url, opciones.method]).toEqual(['/api/v1/trampas/t-1/qr/reemplazar', 'POST'])
    expect(JSON.parse(opciones.body)).toMatchObject({ motivo: 'Borrosa', id: expect.any(String) })
  })

  it('muestra el historial de reemplazos', async () => {
    simularFetch(respuestaJson(200, HISTORIAL))
    render(<ReponerEtiqueta trampa={TRAMPA} puedeReemplazar alReemplazar={vi.fn()} />)
    expect(await screen.findByText('Reemplazos anteriores')).toBeInTheDocument()
    expect(screen.getByText(/· Rota/)).toBeInTheDocument()
    expect(screen.getByText(/Ana Ruiz/)).toBeInTheDocument()
  })

  it('sin permiso solo puede reimprimir', () => {
    simularFetch(respuestaJson(200, []))
    render(<ReponerEtiqueta trampa={TRAMPA} puedeReemplazar={false} alReemplazar={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Reimprimir etiqueta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reemplazar etiqueta' })).not.toBeInTheDocument()
  })
})
