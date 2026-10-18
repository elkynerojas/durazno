import { describe, expect, it } from 'vitest'

import { moscasObjetivo, mtdTrampa } from './mtd'

const CAPTURAS = { capitata_machos: 4, capitata_hembras: 1, anastrepha: 3 }

describe('MTD de una trampa (referencia en el formulario)', () => {
  it('cuenta las moscas de la especie que vigila cada trampa', () => {
    expect(moscasObjetivo('jackson', CAPTURAS)).toBe(5)
    expect(moscasObjetivo('mcphail', CAPTURAS)).toBe(3)
  })

  it('calcula M / (1 × D) como a mano', () => {
    // 5 moscas en 7 días: 5 / (1 × 7) = 0,714…
    expect(mtdTrampa(5, 7)).toBeCloseTo(0.7143, 4)
    // 3 moscas en 14 días: 3 / 14 = 0,214…
    expect(mtdTrampa(3, 14)).toBeCloseTo(0.2143, 4)
    expect(mtdTrampa(0, 7)).toBe(0)
  })

  it('sin días de exposición no está definido (no divide por cero)', () => {
    expect(mtdTrampa(5, 0)).toBeNull()
  })
})
