import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import AdministrarTipos from './AdministrarTipos'

const HONGO = { id: 'h-1', nombre: 'Hongo o enfermedad', color: '#8e44ad', activo: true, orden: 10 }
const PLAGA = { id: 'p-1', nombre: 'Plaga', color: '#d35400', activo: true, orden: 20 }

const cuerpo = (llamada) => JSON.parse(llamada[1].body)

describe('AdministrarTipos', () => {
  it('lista todos los tipos, incluidos los desactivados', async () => {
    const fetch = simularFetch(respuestaJson(200, [HONGO, { ...PLAGA, activo: false }]))
    render(<AdministrarTipos />)
    const lista = await screen.findByRole('region', { name: 'Tipos de hallazgo' })
    expect(within(lista).getByText('Hongo o enfermedad')).toBeInTheDocument()
    expect(within(lista).getByText('Desactivado')).toBeInTheDocument()
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/inspecciones/tipos?todos=true')
  })

  it('agrega un tipo con su color y orden al final', async () => {
    const usuario = userEvent.setup()
    const fetch = simularFetch(
      respuestaJson(200, [HONGO, PLAGA]),
      respuestaJson(201, {
        id: 'g-1',
        nombre: 'Gomosis',
        color: '#d35400',
        activo: true,
        orden: 30,
      }),
    )
    render(<AdministrarTipos />)
    await screen.findByText('Plaga')
    await usuario.type(screen.getByLabelText('Nombre'), 'Gomosis')
    await usuario.click(screen.getByRole('button', { name: 'Agregar tipo' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Tipo «Gomosis» agregado.')
    const datos = cuerpo(fetch.mock.calls[1])
    expect(datos).toMatchObject({ nombre: 'Gomosis', color: '#d35400', orden: 30 })
    expect(datos.id).toBeTruthy()
    expect(screen.getByLabelText('Nombre')).toHaveValue('')
  })

  it('muestra el mensaje del servidor si el nombre ya existe', async () => {
    const usuario = userEvent.setup()
    simularFetch(
      respuestaJson(200, [HONGO]),
      respuestaJson(409, { detail: 'Ya existe un tipo de hallazgo con ese nombre' }),
    )
    render(<AdministrarTipos />)
    await screen.findByText('Hongo o enfermedad')
    await usuario.type(screen.getByLabelText('Nombre'), 'hongo o enfermedad')
    await usuario.click(screen.getByRole('button', { name: 'Agregar tipo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un tipo de hallazgo con ese nombre',
    )
  })

  it('renombra y desactiva un tipo', async () => {
    const usuario = userEvent.setup()
    const fetch = simularFetch(
      respuestaJson(200, [HONGO, PLAGA]),
      respuestaJson(200, { ...PLAGA, nombre: 'Plaga (insectos)' }),
      respuestaJson(200, { ...PLAGA, nombre: 'Plaga (insectos)', activo: false }),
    )
    render(<AdministrarTipos />)
    await usuario.click(await screen.findByRole('button', { name: 'Editar Plaga' }))
    const edicion = screen.getByRole('form', { name: 'Editar Plaga' })
    const nombre = within(edicion).getByLabelText('Nombre')
    await usuario.clear(nombre)
    await usuario.type(nombre, 'Plaga (insectos)')
    await usuario.click(within(edicion).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Plaga (insectos)')).toBeInTheDocument()
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/inspecciones/tipos/p-1')
    expect(cuerpo(fetch.mock.calls[1])).toEqual({ nombre: 'Plaga (insectos)', color: '#d35400' })

    await usuario.click(screen.getByRole('button', { name: 'Desactivar Plaga (insectos)' }))
    expect(await screen.findByRole('status')).toHaveTextContent('desactivado')
    expect(cuerpo(fetch.mock.calls[2])).toEqual({ activo: false })
  })
})
