import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { respuestaBinaria, respuestaJson, simularFetch } from '../../test/utilidades'
import BotonesExportar from './BotonesExportar'

beforeEach(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
})

describe('BotonesExportar', () => {
  it('exporta todo el predio en GeoJSON y KML', async () => {
    const fetchSimulado = simularFetch(
      respuestaBinaria(200, '{}', 'application/geo+json'),
      respuestaBinaria(200, '<kml/>', 'application/vnd.google-earth.kml+xml'),
    )
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const usuarioEvento = userEvent.setup()
    render(<BotonesExportar />)

    await usuarioEvento.click(screen.getByRole('button', { name: 'Exportar GeoJSON' }))
    await usuarioEvento.click(screen.getByRole('button', { name: 'Exportar KML' }))

    expect(fetchSimulado.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/export/geojson',
      '/api/v1/export/kml',
    ])
    expect(clic.mock.contexts.map((a) => a.download)).toEqual([
      'predio-icota.geojson',
      'predio-icota.kml',
    ])
  })

  it('exporta solo un lote', async () => {
    const fetchSimulado = simularFetch(respuestaBinaria(200, '<kml/>', 'application/xml'))
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<BotonesExportar lote={{ id: 'l-3', codigo: 'L-03' }} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Lote en KML' }))

    expect(fetchSimulado.mock.calls[0][0]).toBe('/api/v1/export/kml?lote_id=l-3')
    expect(clic.mock.contexts[0].download).toBe('lote-L-03.kml')
  })

  it('avisa si falla', async () => {
    simularFetch(respuestaJson(500, {}))
    render(<BotonesExportar />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Exportar GeoJSON' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo exportar')
  })
})
