import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import VisitaAdicional from './VisitaAdicional'

const LECTURA = {
  id: 'l-1',
  observado_en: '2026-10-15T07:00:00-05:00',
  responsable_id: 'u-2',
  responsable_nombre: 'Ana Técnica',
}
const PERSONAL = [
  { id: 'u-1', nombre_completo: 'Luis Agrónomo' },
  { id: 'u-2', nombre_completo: 'Ana Técnica' },
]

describe('VisitaAdicional', () => {
  it('propone la semana siguiente y programa la visita', async () => {
    const fetchSimulado = simularFetch(respuestaJson(201, { id: 'a-1', semana: 43 }))
    const usuarioEvento = userEvent.setup()
    render(
      <MemoryRouter>
        <VisitaAdicional lectura={LECTURA} personal={PERSONAL} />
      </MemoryRouter>,
    )
    await usuarioEvento.click(screen.getByRole('button', { name: 'Programar visita adicional' }))
    // Lectura del jueves 15 de octubre (S42): se propone la S43.
    expect(screen.getByLabelText('Semana de la visita adicional (2026)')).toHaveValue(43)
    expect(screen.getByText('19–25 oct 2026')).toBeInTheDocument()
    expect(screen.getByLabelText('Responsable')).toHaveValue('u-2')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Programar' }))

    const [ruta, opciones] = fetchSimulado.mock.calls[0]
    expect(ruta).toBe('/api/v1/plan/visita-adicional')
    const { id, ...cuerpo } = JSON.parse(opciones.body)
    expect(id).toEqual(expect.any(String))
    expect(cuerpo).toEqual({ lectura_id: 'l-1', anio: 2026, semana: 43, responsable_id: 'u-2' })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Visita adicional programada en la semana 43.',
    )
  })
})
