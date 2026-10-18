import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import { ConContextos } from '../../test/contextos'
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
  lote: { id: 'l-3', predio_id: 'p-1', codigo: 'L-03', nombre: 'Rubidoux' },
  ruta: null,
  ultima_lectura: null,
}

function renderizar(rol = 'tecnico', ruta = '/t/ABCD2345', seleccionar = vi.fn()) {
  render(
    <ConContextos usuario={{ nombre_completo: 'Ana', rol }} seleccionar={seleccionar}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/t/:codigo" element={<VistaFichaTrampa />} />
        </Routes>
      </MemoryRouter>
    </ConContextos>,
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
    expect(screen.getByRole('link', { name: 'Registrar lectura' })).toHaveAttribute(
      'href',
      '/t/ABCD2345/lectura',
    )
    expect(screen.getByRole('link', { name: 'Ver en el mapa' })).toHaveAttribute(
      'href',
      '/trampas?trampa=t-1',
    )
    expect(screen.getByText('Sin ruta definida')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('muestra la última lectura con su enlace al historial', async () => {
    simularFetch(
      respuestaJson(200, {
        ...RESUELTA,
        ultima_lectura: {
          id: 'lec-1',
          observado_en: '2026-10-14T08:30:00-05:00',
          capitata_machos: 3,
          capitata_hembras: 1,
          anastrepha: 0,
          dias_exposicion: 7,
          estado: 'validada',
        },
      }),
    )
    renderizar()

    const seccion = await screen.findByRole('region', { name: 'Última lectura' })
    expect(seccion).toHaveTextContent('4 (3 ♂ · 1 ♀)')
    expect(seccion).toHaveTextContent('7 días')
    expect(screen.getByRole('link', { name: 'Ver historial de capturas' })).toHaveAttribute(
      'href',
      '/historial?trampa=t-1',
    )
    expect(screen.getByRole('link', { name: 'Registrar lectura' })).toBeInTheDocument()
  })

  it('indica la posición de la trampa en la ruta del lote', async () => {
    simularFetch(
      respuestaJson(200, {
        ...RESUELTA,
        ruta: { id: 'r-1', orden: 2, total: 6, siguiente: 'ICA-0032' },
      }),
    )
    renderizar()

    expect(
      await screen.findByRole('link', { name: 'Parada 2 de 6 · sigue ICA-0032' }),
    ).toHaveAttribute('href', '/rutas?lote=l-3')
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
    expect(screen.queryByRole('link', { name: 'Registrar lectura' })).not.toBeInTheDocument()
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

  it('si la trampa es de otro predio asignado, cambia el predio actual', async () => {
    simularFetch(respuestaJson(200, { ...RESUELTA, lote: { ...RESUELTA.lote, predio_id: 'p-9' } }))
    const seleccionar = vi.fn()
    renderizar('tecnico', '/t/ABCD2345', seleccionar)
    await screen.findByRole('heading', { level: 1, name: 'ICA-0031' })
    // El cambio de predio ocurre en un efecto después de pintar la ficha.
    await waitFor(() => expect(seleccionar).toHaveBeenCalledWith('p-9'))
  })
})
