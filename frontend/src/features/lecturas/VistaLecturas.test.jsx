import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ConContextos } from '../../test/contextos'
import { respuestaJson } from '../../test/utilidades'
import VistaLecturas from './VistaLecturas'

vi.mock('../../components/EstadoApi', () => ({ default: () => null }))

const lectura = (id, codigo, avisos = []) => ({
  id,
  trampa_id: `t-${id}`,
  trampa_codigo_ica: codigo,
  lote_codigo: 'L-01',
  observado_en: '2026-10-15T07:00:00-05:00',
  responsable_nombre: 'Ana Técnica',
  capitata_machos: 4,
  capitata_hembras: 1,
  anastrepha: 0,
  dias_exposicion: 7,
  estado_trampa: 'buena',
  cambio_atrayente: false,
  observaciones: null,
  distancia_m: 8,
  avisos,
  estado: 'registrada',
  revisada_por: null,
  revisada_en: null,
  motivo_rechazo: null,
})

const PENDIENTES = [
  lectura('1', 'ICA-01', ['Tomada a 111 m de la trampa (±8 m)']),
  lectura('2', 'ICA-02'),
  lectura('3', 'ICA-03'),
]

function simularApi() {
  const fetchSimulado = vi.fn(async (url, opciones) => {
    if (opciones?.method === 'POST') {
      const id = url.split('/').at(-2)
      const datos = JSON.parse(opciones.body)
      const original = PENDIENTES.find((l) => l.id === id)
      return respuestaJson(200, { ...original, ...datos, revisada_por: 'Luis Agrónomo' })
    }
    return respuestaJson(200, url.includes('estado=registrada') ? PENDIENTES : [])
  })
  vi.stubGlobal('fetch', fetchSimulado)
  return fetchSimulado
}

function renderizar(rol = 'agronomo') {
  render(
    <ConContextos usuario={{ nombre_completo: 'Luis', rol }}>
      <MemoryRouter>
        <VistaLecturas />
      </MemoryRouter>
    </ConContextos>,
  )
}

const posts = (fetchSimulado) =>
  fetchSimulado.mock.calls
    .filter(([, o]) => o?.method === 'POST')
    .map(([url, o]) => [url, JSON.parse(o.body)])

describe('VistaLecturas', () => {
  it('muestra las pendientes con sus avisos y permite rechazar con motivo', async () => {
    const fetchSimulado = simularApi()
    const usuarioEvento = userEvent.setup()
    renderizar()

    const tarjeta = await screen.findByRole('listitem', { name: 'Lectura de ICA-01' })
    expect(tarjeta).toHaveTextContent('Tomada a 111 m de la trampa (±8 m)')
    expect(tarjeta).toHaveTextContent('5 (4 ♂ · 1 ♀)')
    expect(fetchSimulado.mock.calls.map(([url]) => url)).toContain(
      '/api/v1/visitas/lecturas?predio_id=p-1&estado=registrada&antiguas_primero=true&limite=200',
    )

    await usuarioEvento.click(within(tarjeta).getByRole('button', { name: 'Rechazar…' }))
    const boton = within(tarjeta).getByRole('button', { name: 'Rechazar' })
    expect(boton).toBeDisabled()
    await usuarioEvento.type(
      within(tarjeta).getByLabelText('Motivo del rechazo'),
      'Lejos de la trampa',
    )
    await usuarioEvento.click(boton)

    expect(posts(fetchSimulado)).toEqual([
      [
        '/api/v1/visitas/lecturas/1/revision',
        { estado: 'rechazada', motivo: 'Lejos de la trampa', estado_esperado: 'registrada' },
      ],
    ])
    expect(await screen.findByText('Lectura de ICA-01 rechazada.')).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'Lectura de ICA-01' })).not.toBeInTheDocument()
  })

  it('valida de una vez las lecturas sin avisos', async () => {
    const fetchSimulado = simularApi()
    const usuarioEvento = userEvent.setup()
    renderizar()
    await usuarioEvento.click(
      await screen.findByRole('button', { name: 'Validar las 2 sin avisos' }),
    )

    expect(await screen.findByText('2 lecturas validadas.')).toBeInTheDocument()
    expect(posts(fetchSimulado).map(([url]) => url)).toEqual([
      '/api/v1/visitas/lecturas/2/revision',
      '/api/v1/visitas/lecturas/3/revision',
    ])
    expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
      'Lectura de ICA-01',
    ])
  })

  it('cambia de pestaña y muestra cuando no hay lecturas', async () => {
    simularApi()
    const usuarioEvento = userEvent.setup()
    renderizar()
    await screen.findByRole('listitem', { name: 'Lectura de ICA-01' })
    await usuarioEvento.click(screen.getByRole('button', { name: 'Rechazadas' }))
    expect(await screen.findByText('No hay lecturas en este estado.')).toBeInTheDocument()
  })
})
