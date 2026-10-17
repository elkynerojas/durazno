import { describe, expect, it } from 'vitest'

import { fechaCorta, rangoSemana, semanaIso } from './fechas'

describe('fechas', () => {
  it.each([
    ['2026-10-17T15:00:00Z', 42],
    ['2026-01-01T15:00:00Z', 1],
    ['2027-01-01T15:00:00Z', 53],
    ['2026-12-28T15:00:00Z', 53],
  ])('calcula la semana ISO de %s', (fecha, numero) => {
    expect(semanaIso(new Date(fecha)).numero).toBe(numero)
  })

  it('usa el día de Bogotá y no el de UTC', () => {
    // Lunes 19 oct 2026 a las 02:00 UTC sigue siendo domingo 18 en Bogotá: semana 42.
    expect(semanaIso(new Date('2026-10-19T02:00:00Z')).numero).toBe(42)
  })

  it('presenta el rango de la semana', () => {
    expect(rangoSemana(semanaIso(new Date('2026-10-17T15:00:00Z')))).toBe('12–18 oct 2026')
    expect(rangoSemana(semanaIso(new Date('2026-10-01T15:00:00Z')))).toMatch(
      /^28 sept? – 4 oct 2026$/,
    )
  })

  it('formatea fechas de calendario', () => {
    expect(fechaCorta('2026-09-03')).toBe('03/09/2026')
  })
})
