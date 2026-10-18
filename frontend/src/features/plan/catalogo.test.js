import { describe, expect, it } from 'vitest'

import { filaDe, filasDelPlan } from './catalogo'

const actividad = (id, extra) => ({
  id,
  lote_id: 'l-1',
  lote_codigo: 'L-01',
  estado: 'programada',
  labor: null,
  tipo_trampa: null,
  ...extra,
})

describe('plan: filas de la vista anual', () => {
  it('nombra la fila según el tipo de actividad', () => {
    expect(filaDe(actividad('a', { tipo: 'visita_monitoreo' }))).toMatchObject({
      titulo: 'Ruta L-01',
      detalle: 'Monitoreo · trampeo',
    })
    expect(
      filaDe(actividad('b', { tipo: 'cambio_atrayente', tipo_trampa: 'mcphail' })),
    ).toMatchObject({ titulo: 'Recambio proteína', detalle: 'Trampas McPhail · L-01' })
    expect(filaDe(actividad('c', { tipo: 'labor_cultural', labor: 'raleo' }))).toMatchObject({
      titulo: 'Raleo de frutos',
      detalle: 'Cultivo · L-01',
    })
  })

  it('agrupa por lote y actividad, con las semanas de cada fila', () => {
    const filas = filasDelPlan([
      actividad('1', { tipo: 'labor_cultural', labor: 'poda', semana: 6 }),
      actividad('2', { tipo: 'visita_monitoreo', semana: 1 }),
      actividad('3', { tipo: 'visita_monitoreo', semana: 2 }),
      actividad('4', {
        tipo: 'visita_monitoreo',
        semana: 1,
        lote_id: 'l-10',
        lote_codigo: 'L-10',
      }),
      actividad('5', { tipo: 'visita_monitoreo', semana: 1, lote_id: 'l-2', lote_codigo: 'L-2' }),
    ])
    expect(filas.map((f) => f.titulo)).toEqual(['Ruta L-01', 'Poda', 'Ruta L-2', 'Ruta L-10'])
    expect([...filas[0].semanas.keys()]).toEqual([1, 2])
  })
})
