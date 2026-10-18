import { describe, expect, it } from 'vitest'

import { describirCambio, detalleSemana, estadoCombinado, filaDe, filasDelPlan } from './catalogo'

const actividad = (id, extra) => ({
  id,
  lote_id: 'l-1',
  lote_codigo: 'L-01',
  estado: 'programada',
  labor: null,
  tipo_trampa: null,
  ...extra,
})

describe('plan: filas del calendario', () => {
  it('nombra la fila como el mockup: rutas por lote, recambios y labores del predio', () => {
    expect(filaDe(actividad('a', { tipo: 'visita_monitoreo' }))).toMatchObject({
      titulo: 'Ruta L-01',
      detalle: 'Monitoreo · trampeo',
    })
    expect(
      filaDe(actividad('b', { tipo: 'cambio_atrayente', tipo_trampa: 'mcphail' })),
    ).toMatchObject({ titulo: 'Recambio proteína', detalle: 'Trampas McPhail' })
    expect(filaDe(actividad('c', { tipo: 'labor_cultural', labor: 'raleo' }))).toMatchObject({
      titulo: 'Raleo de frutos',
      detalle: 'Cultivo',
    })
  })

  it('sin actividades muestra las rutas y los recambios', () => {
    const filas = filasDelPlan(
      [],
      [
        { id: 'l-10', codigo: 'L-10' },
        { id: 'l-2', codigo: 'L-02' },
      ],
    )
    expect(filas.map((f) => f.titulo)).toEqual([
      'Ruta L-02',
      'Ruta L-10',
      'Recambio trimedlure',
      'Recambio proteína',
    ])
    expect(filas[0].nuevo).toEqual({ tipo: 'visita_monitoreo', lote_id: 'l-2' })
  })

  it('agrupa las labores de varios lotes en una fila por labor', () => {
    const filas = filasDelPlan([
      actividad('1', { tipo: 'labor_cultural', labor: 'cosecha', semana: 20 }),
      actividad('2', { tipo: 'labor_cultural', labor: 'poda', semana: 6 }),
      actividad('3', {
        tipo: 'labor_cultural',
        labor: 'poda',
        semana: 6,
        lote_id: 'l-2',
        lote_codigo: 'L-02',
      }),
    ])
    expect(filas.map((f) => f.titulo)).toEqual([
      'Recambio trimedlure',
      'Recambio proteína',
      'Poda',
      'Cosecha',
    ])
    expect(filas[2].semanas.get(6).map((a) => a.id)).toEqual(['2', '3'])
  })

  it('combina los estados de una celda', () => {
    const con = (...estados) => estados.map((estado, i) => actividad(String(i), { estado }))
    expect(estadoCombinado(con('cumplida', 'vencida'))).toBe('vencida')
    expect(estadoCombinado(con('cumplida', 'reprogramada', 'programada'))).toBe('reprogramada')
    expect(estadoCombinado(con('cumplida', 'programada'))).toBe('programada')
    expect(estadoCombinado(con('cumplida', 'cumplida'))).toBe('cumplida')
  })

  it('describe la actividad en la lista de la semana', () => {
    expect(
      detalleSemana(actividad('a', { tipo: 'visita_monitoreo', avance: { hechas: 1, total: 6 } })),
    ).toBe('lectura de 6 trampas')
    expect(
      detalleSemana(
        actividad('b', {
          tipo: 'cambio_atrayente',
          tipo_trampa: 'jackson',
          avance: { hechas: 0, total: 9 },
        }),
      ),
    ).toBe('9 trampas Jackson · L-01')
    expect(detalleSemana(actividad('c', { tipo: 'labor_cultural', labor: 'poda' }))).toBe(
      'Lote L-01',
    )
  })
})

describe('plan: descripción de los cambios', () => {
  const base = { anio_anterior: 2026, semana_anterior: 42 }
  it('describe reprogramaciones, reasignaciones y eliminaciones', () => {
    expect(
      describirCambio({ ...base, accion: 'reprogramada', anio_nuevo: 2026, semana_nueva: 44 }),
    ).toBe('Reprogramada de S42 a S44')
    expect(
      describirCambio({ ...base, accion: 'reprogramada', anio_nuevo: 2027, semana_nueva: 2 }),
    ).toBe('Reprogramada de S42 a S2 de 2027')
    expect(
      describirCambio({
        ...base,
        accion: 'responsable',
        responsable_anterior: 'Ana',
        responsable_nuevo: 'Luis',
      }),
    ).toBe('Responsable: Ana → Luis')
    expect(describirCambio({ ...base, accion: 'eliminada' })).toBe('Eliminada (S42)')
  })
})
