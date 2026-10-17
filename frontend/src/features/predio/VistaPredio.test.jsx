import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import { ContextoSesion } from '../auth/useSesion'
import VistaPredio from './VistaPredio'

vi.mock('../../components/EstadoApi', () => ({ default: () => null }))

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
const PREDIO = {
  id: 'p-1',
  nombre: 'Finca Icota',
  vereda: 'Icota',
  municipio: 'Cácota',
  registro_ica: '54125-ICA-001',
  area_ha: 32.5,
  limite: LIMITE,
}

function renderizar(rol = 'agronomo') {
  render(
    <ContextoSesion.Provider value={{ usuario: { nombre_completo: 'Ana', rol }, salir: vi.fn() }}>
      <MemoryRouter>
        <VistaPredio />
      </MemoryRouter>
    </ContextoSesion.Provider>,
  )
}

const cuerpoEnviado = (fetchSimulado) => JSON.parse(fetchSimulado.mock.calls.at(-1)[1].body)

describe('VistaPredio', () => {
  it('registra el predio por primera vez con id del cliente', async () => {
    const fetchSimulado = simularFetch(
      respuestaJson(404, { detail: 'El predio aún no se ha registrado' }),
      respuestaJson(201, { ...PREDIO, limite: null }),
    )
    const usuarioEvento = userEvent.setup()
    renderizar()

    await usuarioEvento.type(await screen.findByLabelText('Nombre'), 'Finca Icota')
    await usuarioEvento.type(screen.getByLabelText('Área (hectáreas)'), '32.5')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Datos del predio guardados.')
    const [ruta, opciones] = fetchSimulado.mock.calls.at(-1)
    expect(ruta).toBe('/api/v1/predio')
    expect(opciones.method).toBe('PUT')
    expect(cuerpoEnviado(fetchSimulado)).toMatchObject({
      nombre: 'Finca Icota',
      vereda: 'Icota',
      municipio: 'Cácota',
      registro_ica: null,
      area_ha: 32.5,
      limite: null,
    })
    expect(cuerpoEnviado(fetchSimulado).id).toEqual(expect.any(String))
  })

  it('al editar conserva el límite y no envía id', async () => {
    const fetchSimulado = simularFetch(
      respuestaJson(200, PREDIO),
      respuestaJson(200, { ...PREDIO, nombre: 'Finca Icota Alta' }),
    )
    const usuarioEvento = userEvent.setup()
    renderizar()

    const nombre = await screen.findByLabelText('Nombre')
    expect(nombre).toHaveValue('Finca Icota')
    await usuarioEvento.clear(nombre)
    await usuarioEvento.type(nombre, 'Finca Icota Alta')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    await screen.findByRole('status')
    const cuerpo = cuerpoEnviado(fetchSimulado)
    expect(cuerpo.limite).toEqual(LIMITE)
    expect(cuerpo).not.toHaveProperty('id')
    expect(cuerpo.nombre).toBe('Finca Icota Alta')
  })

  it.each(['tecnico', 'productor'])('el rol %s solo consulta', async (rol) => {
    simularFetch(respuestaJson(200, PREDIO))
    renderizar(rol)

    expect(await screen.findByLabelText('Nombre')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
  })

  it('avisa a otros roles si el predio no se ha registrado', async () => {
    simularFetch(respuestaJson(404, { detail: 'El predio aún no se ha registrado' }))
    renderizar('tecnico')

    expect(
      await screen.findByText('El agrónomo aún no ha registrado el predio.'),
    ).toBeInTheDocument()
  })

  it('muestra un error si la API rechaza los datos', async () => {
    simularFetch(respuestaJson(200, PREDIO), respuestaJson(422, { detail: [] }))
    const usuarioEvento = userEvent.setup()
    renderizar()

    await screen.findByLabelText('Nombre')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Revise los datos del formulario.')
  })
})
