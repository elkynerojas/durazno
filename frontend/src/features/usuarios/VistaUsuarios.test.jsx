import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import { ConContextos } from '../../test/contextos'
import VistaUsuarios from './VistaUsuarios'

vi.mock('../../components/EstadoApi', () => ({ default: () => null }))

const AGRONOMO = {
  id: 'a-1',
  nombre_completo: 'Agrónoma Jefe',
  correo: 'jefe@ejemplo.com',
  rol: 'agronomo',
  activo: true,
}
const TECNICO = {
  id: 't-1',
  nombre_completo: 'Técnico Uno',
  correo: 'tecnico@ejemplo.com',
  rol: 'tecnico',
  activo: true,
}

function renderizar() {
  render(
    <ConContextos usuario={AGRONOMO}>
      <MemoryRouter>
        <VistaUsuarios />
      </MemoryRouter>
    </ConContextos>,
  )
}

describe('VistaUsuarios', () => {
  it('lista las cuentas con su rol y estado', async () => {
    simularFetch(respuestaJson(200, [AGRONOMO, { ...TECNICO, activo: false }]))
    renderizar()

    const fila = (await screen.findByText('Técnico Uno')).closest('li')
    expect(within(fila).getByText('Técnico · Desactivado')).toBeInTheDocument()
    expect(within(fila).getByRole('button', { name: 'Activar a Técnico Uno' })).toBeInTheDocument()
  })

  it('no ofrece desactivar la propia cuenta', async () => {
    simularFetch(respuestaJson(200, [AGRONOMO]))
    renderizar()

    await screen.findByText('Agrónoma Jefe')
    expect(screen.queryByRole('button', { name: /Desactivar/ })).not.toBeInTheDocument()
  })

  it('desactiva una cuenta y actualiza la lista', async () => {
    const fetchSimulado = simularFetch(
      respuestaJson(200, [AGRONOMO, TECNICO]),
      respuestaJson(200, { ...TECNICO, activo: false }),
    )
    const usuarioEvento = userEvent.setup()
    renderizar()

    await usuarioEvento.click(
      await screen.findByRole('button', { name: 'Desactivar a Técnico Uno' }),
    )

    const [url, opciones] = fetchSimulado.mock.calls[1]
    expect(url).toBe('/api/v1/usuarios/t-1')
    expect(JSON.parse(opciones.body)).toEqual({ activo: false })
    expect(await screen.findByText('Técnico · Desactivado')).toBeInTheDocument()
  })

  it('abre el formulario de nuevo usuario', async () => {
    simularFetch(respuestaJson(200, [AGRONOMO]))
    const usuarioEvento = userEvent.setup()
    renderizar()

    await usuarioEvento.click(await screen.findByRole('button', { name: 'Nuevo usuario' }))

    expect(screen.getByRole('heading', { name: 'Nuevo usuario' })).toBeInTheDocument()
  })

  it('avisa si no se pudo cargar la lista', async () => {
    simularFetch(respuestaJson(500, {}))
    renderizar()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la lista de usuarios.',
    )
  })
})
