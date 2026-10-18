import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ConContextos } from '../../test/contextos'
import { respuestaJson } from '../../test/utilidades'
import VistaHistorial from './VistaHistorial'

vi.mock('../../components/EstadoApi', () => ({ default: () => null }))

const lectura = (id, dia, extra = {}) => ({
  id,
  observado_en: `2026-10-${dia}T08:00:00-05:00`,
  trampa_id: 't-1',
  trampa_codigo_ica: 'ICA-01',
  tipo: 'jackson',
  lote_id: 'l-1',
  lote_codigo: 'L-01',
  capitata_machos: 3,
  capitata_hembras: 1,
  anastrepha: 0,
  dias_exposicion: 7,
  estado: 'validada',
  mtd: 4 / 7,
  ...extra,
})

const HISTORIAL = {
  desde: '2026-07-27',
  hasta: '2026-10-18',
  total: 51,
  pagina: 1,
  por_pagina: 50,
  serie: [
    { fecha: '2026-10-07', capitata: 2, anastrepha: 0, lecturas: 1 },
    { fecha: '2026-10-14', capitata: 4, anastrepha: 5, lecturas: 2 },
  ],
  lecturas: [
    lectura('a', 14),
    lectura('b', '07', { dias_exposicion: 0, mtd: null, estado: 'registrada' }),
  ],
}

function simularApi() {
  const fetchSimulado = vi.fn(async (url) => {
    if (url.startsWith('/api/v1/historial')) return respuestaJson(200, HISTORIAL)
    if (url.startsWith('/api/v1/lotes')) return respuestaJson(200, [{ id: 'l-1', codigo: 'L-01' }])
    if (url.startsWith('/api/v1/trampas')) {
      return respuestaJson(200, [{ id: 't-1', lote_id: 'l-1', codigo_ica: 'ICA-01' }])
    }
    return respuestaJson(200, [])
  })
  vi.stubGlobal('fetch', fetchSimulado)
  return fetchSimulado
}

function renderizar(ruta = '/historial') {
  render(
    <ConContextos usuario={{ nombre_completo: 'Ana', rol: 'productor' }}>
      <MemoryRouter initialEntries={[ruta]}>
        <VistaHistorial />
      </MemoryRouter>
    </ConContextos>,
  )
}

describe('VistaHistorial', () => {
  it('muestra el gráfico, la tabla y la paginación del predio', async () => {
    const fetchSimulado = simularApi()
    renderizar()
    const tabla = await screen.findByRole('table', { name: 'Lecturas' })
    const [primera, segunda] = within(tabla).getAllByRole('row').slice(1)
    expect(primera).toHaveTextContent(
      '14/10/2026 08:00ICA-01Lote L-014 (3 ♂ · 1 ♀)070,5714Validada',
    )
    expect(segunda).toHaveTextContent('sin datoSin validar')
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Capturas por fecha: 6 C. capitata y 5 Anastrepha en 2 fechas',
    )
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
    expect(fetchSimulado.mock.calls.map(([u]) => u)).toContainEqual(
      expect.stringContaining('/api/v1/historial?predio_id=p-1'),
    )
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-07-27')
  })

  it('abre filtrado por la trampa del enlace y consulta por especie', async () => {
    const fetchSimulado = simularApi()
    const usuarioEvento = userEvent.setup()
    renderizar('/historial?trampa=t-1')
    await screen.findByRole('table', { name: 'Lecturas' })
    const llamada = () =>
      fetchSimulado.mock.calls.filter(([u]) => u.startsWith('/api/v1/historial')).at(-1)[0]
    expect(llamada()).toContain('trampa_id=t-1')
    expect(await screen.findByLabelText('Lote')).toHaveValue('l-1')

    await usuarioEvento.selectOptions(screen.getByLabelText('Especie'), 'anastrepha')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Consultar' }))
    expect(llamada()).toContain('especie=anastrepha')
  })
})
