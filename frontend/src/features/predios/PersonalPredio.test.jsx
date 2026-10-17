import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { PREDIO } from '../../test/datos'
import { respuestaJson, simularFetch } from '../../test/utilidades'
import PersonalPredio from './PersonalPredio'

const ANA = {
  id: 'u-1',
  nombre_completo: 'Ana Ruiz',
  correo: 'a@x.co',
  rol: 'tecnico',
  activo: true,
}
const LUIS = {
  id: 'u-2',
  nombre_completo: 'Luis Peña',
  correo: 'l@x.co',
  rol: 'agronomo',
  activo: true,
}
const ADMIN = {
  id: 'u-3',
  nombre_completo: 'Admin',
  correo: 'ad@x.co',
  rol: 'administrador',
  activo: true,
}
const INACTIVO = {
  id: 'u-4',
  nombre_completo: 'Inactivo',
  correo: 'i@x.co',
  rol: 'tecnico',
  activo: false,
}

describe('PersonalPredio', () => {
  it('lista el personal y ofrece asignar solo cuentas activas no asignadas', async () => {
    simularFetch(respuestaJson(200, [ANA]), respuestaJson(200, [ANA, LUIS, ADMIN, INACTIVO]))
    render(<PersonalPredio predio={PREDIO} />)

    expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument()
    const opciones = within(screen.getByLabelText('Asignar una cuenta'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(opciones).toEqual(['Seleccione', 'Luis Peña · Agrónomo'])
  })

  it('asigna y quita cuentas', async () => {
    const fetchSimulado = simularFetch(
      respuestaJson(200, []),
      respuestaJson(200, [ANA, LUIS]),
      respuestaJson(204, null),
      respuestaJson(200, [LUIS]),
      respuestaJson(204, null),
    )
    const usuarioEvento = userEvent.setup()
    render(<PersonalPredio predio={PREDIO} />)

    await screen.findByText('Nadie está asignado a este predio todavía.')
    await usuarioEvento.selectOptions(screen.getByLabelText('Asignar una cuenta'), 'u-2')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Asignar' }))
    expect(fetchSimulado.mock.calls[2][0]).toBe('/api/v1/predios/p-1/usuarios/u-2')
    expect(fetchSimulado.mock.calls[2][1].method).toBe('PUT')

    await usuarioEvento.click(
      await screen.findByRole('button', { name: 'Quitar a Luis Peña de Finca Icota' }),
    )
    expect(fetchSimulado.mock.calls[4][1].method).toBe('DELETE')
    expect(screen.queryByText('Luis Peña')).not.toBeInTheDocument()
  })
})
