import { describe, expect, it } from 'vitest'

import { formula, textoMtd } from './formato'

describe('formato del MTD', () => {
  it('muestra M, T y D usados con 4 decimales', () => {
    const fila = { moscas: 6, trampas: 2, dias_promedio: 7, mtd: 6 / 14 }
    expect(formula(fila)).toBe('6 ÷ (2 × 7) = 0,4286')
    expect(textoMtd(fila)).toBe('0,4286')
    expect(formula({ moscas: 6, trampas: 2, dias_promedio: 10.5, mtd: 6 / 21 })).toBe(
      '6 ÷ (2 × 10,5) = 0,2857',
    )
  })

  it('sin trampas revisadas no hay dato', () => {
    const fila = { moscas: 0, trampas: 0, dias_promedio: 0, mtd: null }
    expect(formula(fila)).toBe('sin dato (T × D = 0)')
    expect(textoMtd(fila)).toBe('sin dato')
  })
})
