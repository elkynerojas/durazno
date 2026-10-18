import { describe, expect, it } from 'vitest'

import { distanciaAproximadaM } from '../../utils/geo'
import { faltantes, mover, ordenInicial, tramos } from './orden'

const punto = (lat) => ({ type: 'Point', coordinates: [-72.6395, lat] })
const T1 = { id: 't1', codigo_ica: 'ICA-01', geom: punto(7.2702) }
const T2 = { id: 't2', codigo_ica: 'ICA-02', geom: punto(7.2706) }
const T3 = { id: 't3', codigo_ica: 'ICA-03', geom: punto(7.2704) }

describe('rutas: orden', () => {
  it('mueve un elemento a otra posición', () => {
    expect(mover(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(mover(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('parte de la ruta guardada sin las trampas retiradas y con las nuevas al final', () => {
    const ruta = {
      paradas: [
        { trampa_id: 't2', codigo_ica: 'ICA-02' },
        { trampa_id: 't9', codigo_ica: 'ICA-09' },
        { trampa_id: 't1', codigo_ica: 'ICA-01' },
      ],
    }
    expect(ordenInicial(ruta, [T1, T2, T3])).toEqual({
      orden: ['t2', 't1', 't3'],
      quitadas: ['ICA-09'],
      agregadas: ['ICA-03'],
    })
  })

  it('lista las trampas activas que faltan', () => {
    expect(faltantes(['t1'], [T1, T2, T3]).map((t) => t.codigo_ica)).toEqual(['ICA-02', 'ICA-03'])
  })

  it('suma los tramos con distancia aproximada (0,0002° de latitud ≈ 22,1 m)', () => {
    const { distancias, total } = tramos(
      ['t1', 't3', 't2'],
      new Map([T1, T2, T3].map((t) => [t.id, t])),
    )
    expect(distancias[0]).toBeNull()
    expect(distancias[1]).toBeCloseTo(22.2, 0)
    expect(total).toBeCloseTo(44.5, 0)
    expect(distanciaAproximadaM(T1.geom, T1.geom)).toBe(0)
  })
})
