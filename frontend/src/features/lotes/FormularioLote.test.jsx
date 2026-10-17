import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import FormularioLote from './FormularioLote'

const GEOM = {
  type: 'Polygon',
  coordinates: [
    [
      [-72.64, 7.27],
      [-72.639, 7.27],
      [-72.639, 7.271],
      [-72.64, 7.271],
      [-72.64, 7.27],
    ],
  ],
}
const LOTE = { id: 'l-1', codigo: 'L-01', nombre: 'Del río', area_ha: 1.22, geom: GEOM }

const cuerpoEnviado = (fetchSimulado) => JSON.parse(fetchSimulado.mock.calls.at(-1)[1].body)

function renderizar(props) {
  const funciones = { alGuardar: vi.fn(), alEliminar: vi.fn() }
  render(<FormularioLote editable {...funciones} {...props} />)
  return funciones
}

describe('FormularioLote', () => {
  it('pide dibujar antes de guardar un lote nuevo', () => {
    renderizar({})
    expect(screen.getByText(/Use «Dibujar polígono»/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar lote' })).toBeDisabled()
  })

  it('muestra el área aproximada del dibujo y crea el lote con id del cliente', async () => {
    const fetchSimulado = simularFetch(respuestaJson(201, { ...LOTE, advertencias: [] }))
    const usuarioEvento = userEvent.setup()
    const { alGuardar } = renderizar({ geomNueva: GEOM })

    expect(screen.getByLabelText('Área calculada').value).toMatch(/^≈ 1,2[23] ha$/)
    expect(screen.getByRole('status')).toHaveTextContent('Polígono cerrado con 4 vértices')
    await usuarioEvento.type(screen.getByLabelText('Código'), 'L-01')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar lote' }))

    expect(alGuardar).toHaveBeenCalledWith({ ...LOTE, advertencias: [] })
    const [ruta, opciones] = fetchSimulado.mock.calls[0]
    expect([ruta, opciones.method]).toEqual(['/api/v1/lotes', 'POST'])
    const cuerpo = cuerpoEnviado(fetchSimulado)
    expect(cuerpo).toMatchObject({ codigo: 'L-01', geom: GEOM })
    expect(cuerpo).not.toHaveProperty('nombre')
    expect(cuerpo.id).toEqual(expect.any(String))
  })

  it('muestra el mensaje del servidor si rechaza el polígono', async () => {
    simularFetch(
      respuestaJson(422, { detail: 'El polígono no es válido: sus bordes se cruzan entre sí' }),
    )
    const usuarioEvento = userEvent.setup()
    renderizar({ geomNueva: GEOM })

    await usuarioEvento.type(screen.getByLabelText('Código'), 'L-01')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar lote' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('sus bordes se cruzan')
  })

  it('muestra el área del servidor y las advertencias de traslape', () => {
    renderizar({ lote: LOTE, advertencias: ['Se traslapa con el lote L-02 (120 m² en común)'] })
    expect(screen.getByLabelText('Área calculada')).toHaveValue('1,22 ha')
    expect(screen.getByRole('status')).toHaveTextContent('Se traslapa con el lote L-02')
  })

  it('confirma cuando el polígono guardado no se superpone', () => {
    renderizar({ lote: LOTE, advertencias: [] })
    expect(screen.getByRole('status')).toHaveTextContent('No se superpone con otros lotes')
  })

  it('al editar envía la forma nueva solo si se editó en el mapa', async () => {
    const fetchSimulado = simularFetch(
      respuestaJson(200, { ...LOTE, advertencias: [] }),
      respuestaJson(200, { ...LOTE, advertencias: [] }),
    )
    const usuarioEvento = userEvent.setup()
    const obtenerForma = vi.fn(() => GEOM)
    const { rerender } = render(
      <FormularioLote lote={LOTE} editable alGuardar={vi.fn()} obtenerForma={obtenerForma} />,
    )

    await usuarioEvento.clear(screen.getByLabelText('Nombre o referencia'))
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(cuerpoEnviado(fetchSimulado)).toEqual({ codigo: 'L-01', nombre: null })
    expect(obtenerForma).not.toHaveBeenCalled()

    rerender(
      <FormularioLote
        lote={LOTE}
        editable
        editandoForma
        alGuardar={vi.fn()}
        obtenerForma={obtenerForma}
      />,
    )
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(cuerpoEnviado(fetchSimulado).geom).toEqual(GEOM)
    expect(fetchSimulado.mock.calls.at(-1)[0]).toBe('/api/v1/lotes/l-1')
  })

  it('pide confirmación antes de eliminar', async () => {
    const fetchSimulado = simularFetch(respuestaJson(204, null))
    const usuarioEvento = userEvent.setup()
    const { alEliminar } = renderizar({ lote: LOTE })

    await usuarioEvento.click(screen.getByRole('button', { name: 'Eliminar lote' }))
    expect(fetchSimulado).not.toHaveBeenCalled()
    await usuarioEvento.click(screen.getByRole('button', { name: 'Confirmar: eliminar L-01' }))

    expect(alEliminar).toHaveBeenCalledWith('l-1')
    expect(fetchSimulado.mock.calls[0][1].method).toBe('DELETE')
  })

  it('sin permiso solo consulta', () => {
    renderizar({ lote: LOTE, editable: false })
    expect(screen.getByLabelText('Código')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar lote' })).not.toBeInTheDocument()
  })
})
