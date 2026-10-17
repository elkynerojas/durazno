import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ConContextos } from '../../test/contextos'
import { PREDIO } from '../../test/datos'
import { respuestaJson, simularFetch } from '../../test/utilidades'
import VistaPredios from './VistaPredios'

vi.mock('../../components/EstadoApi', () => ({ default: () => null }))

const OTRO = { ...PREDIO, id: 'p-2', nombre: 'Finca Alta' }
const ADMIN = { nombre_completo: 'Admin', rol: 'administrador' }

function renderizar(recargar = vi.fn()) {
  render(
    <ConContextos usuario={ADMIN} predios={[PREDIO, OTRO]} recargar={recargar}>
      <MemoryRouter>
        <VistaPredios />
      </MemoryRouter>
    </ConContextos>,
  )
}

describe('VistaPredios', () => {
  it('lista los predios y abre el formulario de uno nuevo', async () => {
    renderizar()
    const tabla = within(screen.getByRole('table'))
    expect(tabla.getByText('Finca Icota')).toBeInTheDocument()
    expect(tabla.getByText('Finca Alta')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: '+ Nuevo predio' }))
    expect(screen.getByRole('heading', { name: 'Nuevo predio' })).toBeInTheDocument()
  })

  it('elimina tras confirmar y muestra el motivo si tiene lotes', async () => {
    simularFetch(
      respuestaJson(409, {
        detail: 'El predio tiene lotes registrados: elimínelos antes de borrarlo',
      }),
    )
    const usuarioEvento = userEvent.setup()
    renderizar()

    await usuarioEvento.click(screen.getByRole('button', { name: 'Eliminar Finca Alta' }))
    await usuarioEvento.click(
      screen.getByRole('button', { name: 'Confirmar: eliminar Finca Alta' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('tiene lotes registrados')
  })

  it('elimina un predio sin lotes y recarga la lista', async () => {
    const fetchSimulado = simularFetch(respuestaJson(204, null))
    const recargar = vi.fn()
    const usuarioEvento = userEvent.setup()
    renderizar(recargar)

    await usuarioEvento.click(screen.getByRole('button', { name: 'Eliminar Finca Alta' }))
    await usuarioEvento.click(
      screen.getByRole('button', { name: 'Confirmar: eliminar Finca Alta' }),
    )

    expect(fetchSimulado.mock.calls[0][0]).toBe('/api/v1/predios/p-2')
    expect(recargar).toHaveBeenCalled()
  })
})
