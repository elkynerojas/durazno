import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { respuestaBinaria, respuestaJson, simularFetch } from '../../test/utilidades'
import FichaHallazgo from './FichaHallazgo'

const HALLAZGO = {
  id: 'h-1',
  titulo: 'Gusano en frutos',
  descripcion: 'Larvas en 5 árboles',
  tipo_nombre: 'Plaga',
  tipo_color: '#d35400',
  estado: 'abierto',
  lote_codigo: 'L-01',
  observado_en: '2026-11-02T15:00:00Z',
  precision_m: 4.2,
  registrado_por_id: 'u-tec',
  registrado_por_nombre: 'Luis Pérez',
  evidencias: [{ id: 'e-1', ancho: 800, alto: 600, bytes: 1000, orden: 0 }],
}

const props = (usuario, extra = {}) => ({
  hallazgo: HALLAZGO,
  usuario,
  alCambiar: vi.fn(),
  alEliminar: vi.fn(),
  alCerrar: vi.fn(),
  ...extra,
})

beforeEach(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
})

describe('FichaHallazgo', () => {
  it('muestra los datos y la miniatura; el productor no puede editar', async () => {
    const fetch = simularFetch(respuestaBinaria(200, 'jpg', 'image/jpeg'))
    render(<FichaHallazgo {...props({ id: 'u-p', rol: 'productor' })} />)
    expect(screen.getByRole('heading', { name: 'Gusano en frutos' })).toBeInTheDocument()
    expect(screen.getByText('Abierto')).toBeInTheDocument()
    expect(screen.getByText('GPS, precisión ±4 m')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Foto 1' })).toBeInTheDocument()
    expect(fetch.mock.calls[0][0]).toBe(
      '/api/v1/inspecciones/hallazgos/h-1/evidencias/e-1?tamano=miniatura',
    )
    expect(screen.queryByText('Agregar fotos')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar foto 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar hallazgo' })).not.toBeInTheDocument()
  })

  it('abre la foto en grande y la cierra con Escape', async () => {
    simularFetch(respuestaBinaria(200, 'a', 'image/jpeg'), respuestaBinaria(200, 'b', 'image/jpeg'))
    const usuario = userEvent.setup()
    render(<FichaHallazgo {...props({ id: 'u-p', rol: 'productor' })} />)
    await usuario.click(screen.getByRole('button', { name: 'Ver foto 1' }))
    expect(await screen.findByRole('img', { name: 'Foto 1 ampliada' })).toBeInTheDocument()
    await usuario.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el técnico que lo registró agrega fotos, pero no lo elimina', async () => {
    const fetch = simularFetch(
      respuestaBinaria(200, 'a', 'image/jpeg'),
      respuestaJson(201, { id: 'e-2' }),
      respuestaJson(200, HALLAZGO),
    )
    const usuario = userEvent.setup()
    const p = props({ id: 'u-tec', rol: 'tecnico' })
    render(<FichaHallazgo {...p} />)
    await usuario.upload(
      screen.getByLabelText('Agregar fotos'),
      new File(['x'], 'b.jpg', { type: 'image/jpeg' }),
    )
    await vi.waitFor(() => expect(p.alCambiar).toHaveBeenCalledWith(HALLAZGO))
    expect(fetch.mock.calls[1][1].body).toBeInstanceOf(FormData)
    expect(screen.queryByRole('button', { name: 'Eliminar hallazgo' })).not.toBeInTheDocument()
  })

  it('el agrónomo lo elimina tras confirmar', async () => {
    simularFetch(respuestaBinaria(200, 'a', 'image/jpeg'), { ok: true, status: 204 })
    const usuario = userEvent.setup()
    const p = props({ id: 'u-ag', rol: 'agronomo' })
    render(<FichaHallazgo {...p} />)
    await usuario.click(screen.getByRole('button', { name: 'Eliminar hallazgo' }))
    await usuario.click(screen.getByRole('button', { name: 'Confirmar: eliminar hallazgo' }))
    await vi.waitFor(() => expect(p.alEliminar).toHaveBeenCalledWith('h-1'))
  })
})
