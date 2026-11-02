import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ConContextos } from '../../test/contextos'
import { respuestaJson } from '../../test/utilidades'
import VistaInspeccion from './VistaInspeccion'

// Leaflet no corre en jsdom: el mapa y sus capas se prueban en Playwright.
vi.mock('../../components/EstadoApi', () => ({ default: () => null }))
vi.mock('../../components/MapaPredio', () => ({ default: () => null }))
vi.mock('../mapa/useDatosPredio', () => ({
  useDatosPredio: () => ({
    lotes: [{ id: 'l-1', codigo: 'L-01', nombre: null, geom: null }],
    trampas: [],
    lotesIniciales: [],
    cargando: false,
    error: null,
  }),
}))

const TIPOS = [{ id: 'tp-1', nombre: 'Plaga', color: '#d35400', activo: true, orden: 10 }]
const HALLAZGO = {
  id: 'h-1',
  titulo: 'Gusano en frutos',
  descripcion: 'Larvas',
  tipo_id: 'tp-1',
  tipo_nombre: 'Plaga',
  tipo_color: '#d35400',
  estado: 'abierto',
  lote_codigo: 'L-01',
  observado_en: '2026-11-02T15:00:00Z',
  precision_m: null,
  registrado_por_id: null,
  registrado_por_nombre: null,
  ubicacion: { type: 'Point', coordinates: [-72.6, 7.2] },
  vencida: false,
  atenciones: [],
  evidencias: [],
}

function renderizar(rol) {
  const fetch = vi.fn(async (url) =>
    url.startsWith('/api/v1/inspecciones/tipos')
      ? respuestaJson(200, TIPOS)
      : respuestaJson(200, { total: 1, pagina: 1, por_pagina: 200, hallazgos: [HALLAZGO] }),
  )
  vi.stubGlobal('fetch', fetch)
  render(
    <ConContextos usuario={{ id: 'u-1', nombre_completo: 'Ana', rol }}>
      <MemoryRouter>
        <VistaInspeccion />
      </MemoryRouter>
    </ConContextos>,
  )
  return fetch
}

describe('VistaInspeccion', () => {
  it('el productor ve la lista y el detalle, sin registrar ni administrar tipos', async () => {
    const usuario = userEvent.setup()
    renderizar('productor')
    const lista = await screen.findByRole('region', { name: 'Lista de hallazgos' })
    expect(within(lista).getByRole('heading', { name: 'Hallazgos (1)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar hallazgo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tipos de hallazgo' })).not.toBeInTheDocument()

    await usuario.click(within(lista).getByRole('button', { name: /Gusano en frutos/ }))
    const detalle = screen.getByRole('region', { name: 'Detalle' })
    expect(within(detalle).getByRole('heading', { name: 'Gusano en frutos' })).toBeInTheDocument()
    expect(within(detalle).getByText('Marcada en el mapa')).toBeInTheDocument()
  })

  it('filtra por tipo enviando el filtro a la API', async () => {
    const usuario = userEvent.setup()
    const fetch = renderizar('agronomo')
    await screen.findByRole('option', { name: 'Plaga' })
    await usuario.selectOptions(screen.getByLabelText('Tipo'), 'tp-1')
    await vi.waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.includes('tipo_id=tp-1'))).toBe(true),
    )
  })

  it('el técnico abre el formulario de registro', async () => {
    const usuario = userEvent.setup()
    renderizar('tecnico')
    await screen.findByText('Gusano en frutos')
    await usuario.click(screen.getByRole('button', { name: 'Registrar hallazgo' }))
    expect(screen.getByRole('form', { name: 'Registrar hallazgo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar hallazgo' })).not.toBeInTheDocument()
  })

  it('el administrador cambia a la pestaña de tipos', async () => {
    const usuario = userEvent.setup()
    renderizar('administrador')
    await usuario.click(screen.getByRole('button', { name: 'Tipos de hallazgo' }))
    expect(await screen.findByRole('region', { name: 'Tipos de hallazgo' })).toBeInTheDocument()
  })
})
