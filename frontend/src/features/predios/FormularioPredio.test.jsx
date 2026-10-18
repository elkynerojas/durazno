import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PREDIO } from '../../test/datos'
import { respuestaJson, simularFetch } from '../../test/utilidades'
import FormularioPredio from './FormularioPredio'

const LIMITE = {
  type: 'Polygon',
  coordinates: [
    [
      [-72.59, 7.26],
      [-72.58, 7.26],
      [-72.58, 7.27],
      [-72.59, 7.26],
    ],
  ],
}
const cuerpoEnviado = (fetchSimulado) => JSON.parse(fetchSimulado.mock.calls.at(-1)[1].body)

describe('FormularioPredio', () => {
  it('crea un predio con id del cliente', async () => {
    const fetchSimulado = simularFetch(respuestaJson(201, PREDIO))
    const alGuardar = vi.fn()
    const usuarioEvento = userEvent.setup()
    render(<FormularioPredio editable alGuardar={alGuardar} />)

    await usuarioEvento.type(screen.getByLabelText('Nombre'), 'Finca Icota')
    await usuarioEvento.type(screen.getByLabelText('Vereda'), 'Icota')
    await usuarioEvento.type(screen.getByLabelText('Área (hectáreas)'), '32.5')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Crear predio' }))

    expect(alGuardar).toHaveBeenCalledWith(PREDIO)
    const [ruta, opciones] = fetchSimulado.mock.calls[0]
    expect([ruta, opciones.method]).toEqual(['/api/v1/predios', 'POST'])
    expect(cuerpoEnviado(fetchSimulado)).toMatchObject({
      nombre: 'Finca Icota',
      vereda: 'Icota',
      municipio: 'Cácota',
      registro_ica: null,
      area_ha: 32.5,
      limite: null,
      id: expect.any(String),
    })
  })

  it('al editar conserva el límite y no envía id', async () => {
    const predio = { ...PREDIO, limite: LIMITE }
    const fetchSimulado = simularFetch(respuestaJson(200, { ...predio, nombre: 'Finca Alta' }))
    const usuarioEvento = userEvent.setup()
    render(<FormularioPredio predio={predio} editable alGuardar={vi.fn()} />)

    const nombre = screen.getByLabelText('Nombre')
    await usuarioEvento.clear(nombre)
    await usuarioEvento.type(nombre, 'Finca Alta')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(fetchSimulado.mock.calls[0][0]).toBe('/api/v1/predios/p-1')
    expect(fetchSimulado.mock.calls[0][1].method).toBe('PUT')
    const cuerpo = cuerpoEnviado(fetchSimulado)
    expect(cuerpo.limite).toEqual(LIMITE)
    expect(cuerpo).not.toHaveProperty('id')
    expect(await screen.findByRole('status')).toHaveTextContent('Datos del predio guardados.')
  })

  it('sin permiso solo consulta', () => {
    render(<FormularioPredio predio={PREDIO} editable={false} alGuardar={vi.fn()} />)
    expect(screen.getByLabelText('Nombre')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
  })

  it('muestra un error si la API rechaza los datos', async () => {
    simularFetch(respuestaJson(422, { detail: [] }))
    render(<FormularioPredio predio={PREDIO} editable alGuardar={vi.fn()} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revise los datos del formulario.')
  })

  it('con un límite nuevo el área es de solo lectura y no se envía', async () => {
    const fetchSimulado = simularFetch(
      respuestaJson(200, {
        ...PREDIO,
        limite: LIMITE,
        area_ha: 61.2,
        advertencias: ['El lote L-02 sale del límite del predio (120 m²)'],
      }),
    )
    const alGuardar = vi.fn()
    const usuarioEvento = userEvent.setup()
    render(<FormularioPredio predio={PREDIO} limite={LIMITE} editable alGuardar={alGuardar} />)

    const area = screen.getByLabelText('Área (hectáreas)')
    expect(area).toHaveAttribute('readonly')
    expect(area.value).toMatch(/^≈ [\d.,]+ ha$/)
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    const cuerpo = cuerpoEnviado(fetchSimulado)
    expect(cuerpo.limite).toEqual(LIMITE)
    expect(cuerpo).not.toHaveProperty('area_ha')
    expect(
      await screen.findByText('El lote L-02 sale del límite del predio (120 m²)'),
    ).toBeInTheDocument()
  })

  it('al editar vértices lee el límite del mapa al guardar', async () => {
    const fetchSimulado = simularFetch(respuestaJson(200, { ...PREDIO, limite: LIMITE }))
    const obtenerLimite = vi.fn(() => LIMITE)
    render(
      <FormularioPredio
        predio={{ ...PREDIO, limite: LIMITE }}
        obtenerLimite={obtenerLimite}
        editable
        alGuardar={vi.fn()}
      />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar' }))
    expect(obtenerLimite).toHaveBeenCalled()
    expect(cuerpoEnviado(fetchSimulado).limite).toEqual(LIMITE)
  })

  it('al quitar el límite vuelve a pedir el área', async () => {
    const fetchSimulado = simularFetch(respuestaJson(200, PREDIO))
    render(
      <FormularioPredio
        predio={{ ...PREDIO, limite: LIMITE }}
        limite={null}
        editable
        alGuardar={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Área (hectáreas)')).not.toHaveAttribute('readonly')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar' }))
    expect(cuerpoEnviado(fetchSimulado)).toMatchObject({ limite: null, area_ha: 32.5 })
  })
})
