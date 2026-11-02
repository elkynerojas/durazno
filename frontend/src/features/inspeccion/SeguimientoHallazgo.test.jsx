import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import SeguimientoHallazgo from './SeguimientoHallazgo'

const HALLAZGO = {
  id: 'h-1',
  predio_id: 'p-1',
  titulo: 'Gusano en frutos',
  estado: 'abierto',
  vencida: false,
  atenciones: [],
}
const ATENCION = {
  id: 'a-1',
  anio: 2026,
  semana: 45,
  estado: 'programada',
  responsable_id: 'u-tec',
  responsable_nombre: 'Luis Pérez',
  notas: 'Gusano en frutos',
  nota_cumplimiento: null,
  cumplida_en: null,
}
const EN_ATENCION = { ...HALLAZGO, estado: 'en_atencion', atenciones: [ATENCION] }
const PERSONAL = [
  { id: 'u-tec', nombre_completo: 'Luis Pérez', rol: 'tecnico', activo: true },
  { id: 'u-prod', nombre_completo: 'Pedro Gómez', rol: 'productor', activo: true },
]

const cuerpo = (llamada) => JSON.parse(llamada[1].body)

describe('SeguimientoHallazgo', () => {
  it('el agrónomo programa la atención con semana y responsable', async () => {
    const fetch = simularFetch(
      respuestaJson(200, PERSONAL),
      respuestaJson(201, { id: 'a-1' }),
      respuestaJson(200, EN_ATENCION),
    )
    const usuario = userEvent.setup()
    const alCambiar = vi.fn()
    render(
      <SeguimientoHallazgo
        hallazgo={HALLAZGO}
        usuario={{ id: 'u-ag', rol: 'agronomo' }}
        alCambiar={alCambiar}
      />,
    )
    expect(screen.getByText('Sin atención programada en el plan.')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Programar atención' }))
    const responsable = screen.getByLabelText('Responsable')
    expect(await screen.findByRole('option', { name: 'Luis Pérez' })).toBeInTheDocument()
    // Solo técnicos y agrónomos pueden ser responsables.
    expect(screen.queryByRole('option', { name: 'Pedro Gómez' })).not.toBeInTheDocument()
    expect(responsable).toHaveValue('u-tec')
    await usuario.type(screen.getByLabelText('Qué hay que hacer (opcional)'), 'Retirar frutos')
    await usuario.click(screen.getByRole('button', { name: 'Programar en el plan' }))

    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalledWith(EN_ATENCION))
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/plan/atencion-hallazgo')
    expect(cuerpo(fetch.mock.calls[1])).toMatchObject({
      hallazgo_id: 'h-1',
      responsable_id: 'u-tec',
      notas: 'Retirar frutos',
    })
  })

  it('el responsable la marca atendida con una nota', async () => {
    const fetch = simularFetch(
      respuestaJson(200, { ...ATENCION, estado: 'cumplida' }),
      respuestaJson(200, { ...EN_ATENCION, estado: 'atendido' }),
    )
    const usuario = userEvent.setup()
    const alCambiar = vi.fn()
    render(
      <SeguimientoHallazgo
        hallazgo={EN_ATENCION}
        usuario={{ id: 'u-tec', rol: 'tecnico' }}
        alCambiar={alCambiar}
      />,
    )
    expect(screen.getByText('Responsable: Luis Pérez')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Programar atención' })).not.toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Qué se hizo (opcional)'), 'Frutos enterrados')
    await usuario.click(screen.getByRole('button', { name: 'Marcar atendido' }))

    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalled())
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/plan/a-1/cumplimiento')
    expect(cuerpo(fetch.mock.calls[0])).toEqual({ cumplida: true, nota: 'Frutos enterrados' })
  })

  it('otro técnico y el productor solo consultan', () => {
    const { rerender } = render(
      <SeguimientoHallazgo
        hallazgo={EN_ATENCION}
        usuario={{ id: 'u-otro', rol: 'tecnico' }}
        alCambiar={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Marcar atendido' })).not.toBeInTheDocument()
    rerender(
      <SeguimientoHallazgo
        hallazgo={HALLAZGO}
        usuario={{ id: 'u-p', rol: 'productor' }}
        alCambiar={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Programar atención' })).not.toBeInTheDocument()
  })

  it('muestra lo que se hizo en una atención cumplida', () => {
    render(
      <SeguimientoHallazgo
        hallazgo={{
          ...HALLAZGO,
          estado: 'atendido',
          atenciones: [{ ...ATENCION, estado: 'cumplida', nota_cumplimiento: 'Poda sanitaria' }],
        }}
        usuario={{ id: 'u-ag', rol: 'agronomo' }}
        alCambiar={vi.fn()}
      />,
    )
    expect(screen.getByText('Cumplida')).toBeInTheDocument()
    expect(screen.getByText('Qué se hizo: Poda sanitaria')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Programar atención' })).not.toBeInTheDocument()
  })
})
