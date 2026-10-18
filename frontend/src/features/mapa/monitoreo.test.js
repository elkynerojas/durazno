import { describe, expect, it } from 'vitest'

import { textoRevision } from './monitoreo'
import { separarMapa } from './useMapa'

const PUNTO = { type: 'Point', coordinates: [-72.6395, 7.2705] }
const POLIGONO = {
  type: 'Polygon',
  coordinates: [
    [
      [-72.64, 7.27],
      [-72.639, 7.27],
      [-72.639, 7.271],
      [-72.64, 7.27],
    ],
  ],
}

describe('separarMapa', () => {
  it('separa lotes y trampas ordenados, con la geometría en geom', () => {
    const lote = (codigo) => ({
      type: 'Feature',
      geometry: POLIGONO,
      properties: { elemento: 'lote', id: codigo, codigo },
    })
    const trampa = (codigo_ica) => ({
      type: 'Feature',
      geometry: PUNTO,
      properties: { elemento: 'trampa', id: codigo_ica, codigo_ica, monitoreo: 'vencida' },
    })
    const resumen = { al_dia: 0, pendiente: 0, vencida: 2, no_activas: 0 }
    const separado = separarMapa({
      type: 'FeatureCollection',
      features: [lote('L-10'), trampa('ICA-10'), lote('L-2'), trampa('ICA-9')],
      resumen,
      umbrales: { dias_revision: 7, dias_vencida: 14 },
    })
    expect(separado.lotes.map((l) => l.codigo)).toEqual(['L-2', 'L-10'])
    expect(separado.trampas.map((t) => t.codigo_ica)).toEqual(['ICA-9', 'ICA-10'])
    expect(separado.trampas[0]).toMatchObject({ geom: PUNTO, monitoreo: 'vencida' })
    expect(separado.lotes[0].geom).toEqual(POLIGONO)
    expect(separado.resumen).toEqual(resumen)
  })
})

describe('textoRevision', () => {
  it('cuenta desde la instalación mientras no hay lecturas', () => {
    expect(textoRevision({ monitoreo: 'pendiente', dias_sin_revision: 10 })).toBe(
      '10 días desde la instalación',
    )
    expect(textoRevision({ monitoreo: 'al_dia', dias_sin_revision: 1 })).toBe(
      '1 día desde la instalación',
    )
    expect(textoRevision({ monitoreo: 'al_dia', dias_sin_revision: 0 })).toBe(
      'Instalada o revisada hoy',
    )
  })

  it('con lectura cuenta desde ella y las no activas no se monitorean', () => {
    expect(textoRevision({ monitoreo: 'vencida', dias_sin_revision: 15, ultima_lectura: {} })).toBe(
      '15 días desde la última lectura',
    )
    expect(textoRevision({ monitoreo: null, estado: 'inactiva' })).toBe(
      'No se monitorea (trampa no activa)',
    )
  })
})
