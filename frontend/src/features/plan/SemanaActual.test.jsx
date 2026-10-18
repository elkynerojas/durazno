import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import SemanaActual from './SemanaActual'

const base = (id, extra) => ({
  id,
  lote_id: 'l-1',
  lote_codigo: 'L-03',
  semana: 42,
  estado: 'programada',
  responsable_id: 'u-1',
  responsable_nombre: 'Técnico de campo',
  labor: null,
  tipo_trampa: null,
  avance: null,
  ...extra,
})

const ACTIVIDADES = [
  base('a', { tipo: 'visita_monitoreo', estado: 'cumplida', avance: { hechas: 2, total: 2 } }),
  base('b', { tipo: 'labor_cultural', labor: 'poda' }),
  base('c', {
    tipo: 'visita_monitoreo',
    semana: 41,
    estado: 'vencida',
    lote_codigo: 'L-05',
    avance: { hechas: 0, total: 2 },
  }),
  base('d', { tipo: 'visita_monitoreo', semana: 40, estado: 'cumplida' }),
  base('e', { tipo: 'labor_cultural', labor: 'riego', semana: 30, estado: 'vencida' }),
]

describe('SemanaActual', () => {
  it('cuenta las cumplidas, lista las vencidas y marca labores', async () => {
    const fetchSimulado = simularFetch(
      respuestaJson(200, { ...ACTIVIDADES[1], estado: 'cumplida' }),
    )
    const alCambiar = vi.fn()
    const usuarioEvento = userEvent.setup()
    render(
      <SemanaActual
        anio={2026}
        semana={42}
        actividades={ACTIVIDADES}
        puedeMarcar={() => true}
        alElegir={vi.fn()}
        alCambiar={alCambiar}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Semana 42 · 12–18 oct' })).toBeInTheDocument()
    expect(screen.getByText('1 de 2 cumplidas')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual([
      expect.stringContaining('Ruta L-03 · lectura de 2 trampas'),
      expect.stringContaining('Poda · Lote L-03'),
      expect.stringContaining('Ruta L-05 · lectura de 2 trampas · vencida desde S41'),
    ])
    // La de la S30 no se arrastra: solo se cuenta.
    expect(screen.getByText(/Y 1 vencida de semanas anteriores/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Ruta L-03 cumplida' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Ruta L-03 cumplida' })).toBeDisabled()

    await usuarioEvento.click(screen.getByRole('checkbox', { name: 'Poda cumplida' }))
    expect(fetchSimulado.mock.calls[0][0]).toBe('/api/v1/plan/b/cumplimiento')
    expect(JSON.parse(fetchSimulado.mock.calls[0][1].body)).toEqual({ cumplida: true })
    expect(alCambiar).toHaveBeenCalledWith(expect.objectContaining({ id: 'b', estado: 'cumplida' }))
  })
})
