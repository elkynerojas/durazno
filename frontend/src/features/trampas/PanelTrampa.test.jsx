import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import PanelTrampa from './PanelTrampa'

const cuadro = (x0, y0, x1, y1) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ],
})
const LOTES = [
  { id: 'l-a', codigo: 'L-A', nombre: null, geom: cuadro(-72.64, 7.27, -72.639, 7.271) },
  { id: 'l-b', codigo: 'L-B', nombre: 'Alto', geom: cuadro(-72.63, 7.27, -72.629, 7.271) },
]
const TRAMPA = {
  id: 't-1',
  lote_id: 'l-a',
  codigo_ica: 'ICA-001',
  tipo: 'jackson',
  atrayente: 'Trimedlure',
  fecha_instalacion: '2026-10-01',
  estado: 'activa',
  geom: { type: 'Point', coordinates: [-72.6395, 7.2705] },
  precision_m: 4.5,
}

const cuerpoEnviado = (fetchSimulado) => JSON.parse(fetchSimulado.mock.calls.at(-1)[1].body)

// Envuelve el panel con el estado de coordenadas que en la app maneja VistaMapa.
function ConCoordenadas({ inicial, ...props }) {
  const [coordenadas, setCoordenadas] = useState(inicial)
  return (
    <PanelTrampa
      lotes={LOTES}
      editable
      coordenadas={coordenadas}
      alCambiarCoordenadas={setCoordenadas}
      {...props}
    />
  )
}

describe('PanelTrampa', () => {
  it('registra una trampa por coordenadas y sugiere el lote que la contiene', async () => {
    const fetchSimulado = simularFetch(respuestaJson(201, TRAMPA))
    const usuarioEvento = userEvent.setup()
    const alGuardar = vi.fn()
    render(<ConCoordenadas inicial={{ lat: '', lng: '' }} capturando alGuardar={alGuardar} />)

    await usuarioEvento.type(screen.getByLabelText('Latitud'), '7.2705')
    await usuarioEvento.type(screen.getByLabelText('Longitud'), '-72.6295')
    expect(screen.getByLabelText('Lote')).toHaveValue('l-b')

    await usuarioEvento.type(screen.getByLabelText('Código ICA'), 'ICA-002')
    await usuarioEvento.selectOptions(screen.getByLabelText('Tipo'), 'mcphail')
    expect(screen.getByLabelText('Atrayente')).toHaveValue('Proteína hidrolizada')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(alGuardar).toHaveBeenCalledWith(TRAMPA)
    const cuerpo = cuerpoEnviado(fetchSimulado)
    expect(cuerpo).toMatchObject({
      lote_id: 'l-b',
      codigo_ica: 'ICA-002',
      tipo: 'mcphail',
      atrayente: 'Proteína hidrolizada',
      geom: { type: 'Point', coordinates: [-72.6295, 7.2705] },
    })
    expect(cuerpo.fecha_instalacion).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(cuerpo.id).toEqual(expect.any(String))
    expect(cuerpo).not.toHaveProperty('estado')
  })

  it('no cambia un atrayente escrito a mano al cambiar el tipo', async () => {
    simularFetch()
    const usuarioEvento = userEvent.setup()
    render(<ConCoordenadas inicial={{ lat: '', lng: '' }} alGuardar={vi.fn()} />)

    const atrayente = screen.getByLabelText('Atrayente')
    await usuarioEvento.clear(atrayente)
    await usuarioEvento.type(atrayente, 'Cebo casero')
    await usuarioEvento.selectOptions(screen.getByLabelText('Tipo'), 'mcphail')
    expect(atrayente).toHaveValue('Cebo casero')
  })

  it('muestra el mensaje del servidor si el punto queda fuera del lote', async () => {
    simularFetch(
      respuestaJson(422, {
        detail: 'La ubicación de la trampa debe quedar dentro del polígono de su lote',
      }),
    )
    const usuarioEvento = userEvent.setup()
    render(<ConCoordenadas inicial={{ lat: '7.2705', lng: '-72.635' }} alGuardar={vi.fn()} />)

    await usuarioEvento.selectOptions(screen.getByLabelText('Lote'), 'l-a')
    await usuarioEvento.type(screen.getByLabelText('Código ICA'), 'ICA-003')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('dentro del polígono de su lote')
  })

  it('al editar sin mover no envía la ubicación y conserva la precisión del GPS', async () => {
    const fetchSimulado = simularFetch(respuestaJson(200, { ...TRAMPA, estado: 'inactiva' }))
    const usuarioEvento = userEvent.setup()
    render(
      <ConCoordenadas
        trampa={TRAMPA}
        inicial={{ lat: '7.2705', lng: '-72.6395' }}
        alGuardar={vi.fn()}
      />,
    )

    expect(screen.getByText('Precisión del GPS: ±4.5 m')).toBeInTheDocument()
    await usuarioEvento.selectOptions(screen.getByLabelText('Estado'), 'inactiva')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    const cuerpo = cuerpoEnviado(fetchSimulado)
    expect(fetchSimulado.mock.calls[0][0]).toBe('/api/v1/trampas/t-1')
    expect(cuerpo.estado).toBe('inactiva')
    expect(cuerpo).not.toHaveProperty('geom')
  })

  it('al mover la trampa envía el punto nuevo y borra la precisión', async () => {
    const fetchSimulado = simularFetch(respuestaJson(200, TRAMPA))
    const usuarioEvento = userEvent.setup()
    render(
      <ConCoordenadas
        trampa={TRAMPA}
        inicial={{ lat: '7.2705', lng: '-72.6395' }}
        alGuardar={vi.fn()}
      />,
    )

    const latitud = screen.getByLabelText('Latitud')
    await usuarioEvento.clear(latitud)
    await usuarioEvento.type(latitud, '7.2708')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(cuerpoEnviado(fetchSimulado)).toMatchObject({
      geom: { type: 'Point', coordinates: [-72.6395, 7.2708] },
      precision_m: null,
    })
  })

  it('sin permiso solo consulta', () => {
    render(
      <ConCoordenadas
        trampa={TRAMPA}
        inicial={{ lat: '7.2705', lng: '-72.6395' }}
        editable={false}
      />,
    )

    expect(screen.getByLabelText('Código ICA')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mover en el mapa' })).not.toBeInTheDocument()
  })
})
