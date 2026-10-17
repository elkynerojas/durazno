import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import { ContextoSesion } from '../auth/useSesion'
import VistaFichaTrampa from './VistaFichaTrampa'

vi.mock('../../components/EstadoApi', () => ({ default: () => null }))

const RESUELTA = {
  trampa: {
    id: 't-1',
    lote_id: 'l-3',
    codigo_ica: 'ICA-0031',
    codigo_qr: 'ABCD2345',
    tipo: 'jackson',
    atrayente: 'Trimedlure',
    fecha_instalacion: '2026-09-03',
    estado: 'activa',
    geom: { type: 'Point', coordinates: [-72.64021, 7.27184] },
    precision_m: 4.5,
  },
  lote: { id: 'l-3', codigo: 'L-03', nombre: 'Rubidoux' },
  ruta: null,
  ultima_lectura: null,
}

function renderizar(rol = 'tecnico', ruta = '/t/ABCD2345') {
  render(
    <ContextoSesion.Provider value={{ usuario: { nombre_completo: 'Ana', rol }, salir: vi.fn() }}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/t/:codigo" element={<VistaFichaTrampa />} />
        </Routes>
      </MemoryRouter>
    </ContextoSesion.Provider>,
  )
}

describe('VistaFichaTrampa', () => {
  it('muestra la trampa, su lote y el botón de lectura', async () => {
    const fetchSimulado = simularFetch(respuestaJson(200, RESUELTA))
    renderizar()

    expect(await screen.findByRole('heading', { level: 1, name: 'ICA-0031' })).toBeInTheDocument()
    expect(fetchSimulado.mock.calls[0][0]).toBe('/api/v1/trampas/qr/ABCD2345')
    expect(screen.getByText('L-03 · Rubidoux')).toBeInTheDocument()
    expect(screen.getByText('Jackson + trimedlure')).toBeInTheDocument()
    expect(screen.getByText('7.27184, -72.64021')).toBeInTheDocument()
    expect(screen.getByText('±4.5 m')).toBeInTheDocument()
    expect(
      screen.getByText('Aún no hay lecturas registradas para esta trampa.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar lectura' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Ver en el mapa' })).toHaveAttribute(
      'href',
      '/trampas?trampa=t-1',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('indica en la ficha que la trampa fue retirada', async () => {
    simularFetch(
      respuestaJson(200, { ...RESUELTA, trampa: { ...RESUELTA.trampa, estado: 'retirada' } }),
    )
    renderizar()

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta trampa fue retirada del campo')
    expect(screen.getByText('Retirada')).toBeInTheDocument()
  })

  it('el productor consulta la ficha sin el botón de lectura', async () => {
    simularFetch(respuestaJson(200, RESUELTA))
    renderizar('productor')

    await screen.findByRole('heading', { level: 1, name: 'ICA-0031' })
    expect(screen.queryByRole('button', { name: 'Registrar lectura' })).not.toBeInTheDocument()
  })

  it('ante un código inexistente muestra el mensaje y permite escribir el de la etiqueta', async () => {
    const fetchSimulado = simularFetch(
      respuestaJson(404, { detail: 'No hay ninguna trampa con el código QR ZZZZ2345' }),
      respuestaJson(200, RESUELTA),
    )
    const usuarioEvento = userEvent.setup()
    renderizar('tecnico', '/t/ZZZZ2345')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hay ninguna trampa con el código QR ZZZZ2345',
    )
    await usuarioEvento.type(
      screen.getByLabelText('Escriba el código impreso bajo el QR'),
      'abcd2345',
    )
    await usuarioEvento.click(screen.getByRole('button', { name: 'Buscar trampa' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'ICA-0031' })).toBeInTheDocument()
    expect(fetchSimulado.mock.calls[1][0]).toBe('/api/v1/trampas/qr/ABCD2345')
  })

  it('ante un fallo de red muestra un mensaje genérico', async () => {
    simularFetch(respuestaJson(500, { detail: 'Traza interna' }))
    renderizar()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo consultar la trampa. Intente de nuevo.',
    )
  })
})
