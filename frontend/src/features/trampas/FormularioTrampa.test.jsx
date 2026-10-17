import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import { obtenerUbicacion } from '../../utils/ubicacion'
import FormularioTrampa from './FormularioTrampa'

// El GPS se simula: la utilidad tiene sus propias pruebas.
vi.mock('../../utils/ubicacion', () => ({
  UMBRAL_PRECISION_M: 10,
  obtenerUbicacion: vi.fn(),
}))

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
  codigo_qr: 'ABCD2345',
  tipo: 'jackson',
  atrayente: 'Trimedlure',
  fecha_instalacion: '2026-10-01',
  estado: 'activa',
  geom: { type: 'Point', coordinates: [-72.6395, 7.2705] },
  precision_m: 4.5,
}

const cuerpoEnviado = (fetchSimulado) => JSON.parse(fetchSimulado.mock.calls.at(-1)[1].body)

// Simula la vista: controla el lote y las coordenadas como lo hace VistaTrampas.
function ConEstado({ inicial = { lat: '', lng: '' }, lote = null, ...props }) {
  const [coordenadas, setCoordenadas] = useState(inicial)
  const [loteId, setLoteId] = useState(lote)
  return (
    <FormularioTrampa
      lotes={LOTES}
      loteId={loteId}
      alCambiarLote={setLoteId}
      coordenadas={coordenadas}
      alCambiarCoordenadas={setCoordenadas}
      editable
      alCapturar={vi.fn()}
      {...props}
    />
  )
}

describe('FormularioTrampa', () => {
  it('registra una trampa McPhail con su atrayente y avisa que el punto está en el lote', async () => {
    const fetchSimulado = simularFetch(respuestaJson(201, TRAMPA))
    const usuarioEvento = userEvent.setup()
    const alGuardar = vi.fn()
    render(<ConEstado lote="l-b" alGuardar={alGuardar} />)

    await usuarioEvento.type(screen.getByLabelText('Código ICA (oficial)'), 'ICA-002')
    await usuarioEvento.click(
      screen.getByRole('radio', { name: /McPhail \+ proteína hidrolizada/ }),
    )
    expect(screen.getByLabelText('Atrayente')).toHaveValue('Proteína hidrolizada')
    await usuarioEvento.type(screen.getByLabelText('Latitud'), '7.2705')
    await usuarioEvento.type(screen.getByLabelText('Longitud'), '-72.6295')
    expect(screen.getByRole('status')).toHaveTextContent(
      'El punto está dentro del polígono de L-B.',
    )
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar y generar QR' }))

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

  it('advierte si el punto no cae dentro del lote elegido', () => {
    render(<ConEstado lote="l-a" inicial={{ lat: '7.2705', lng: '-72.635' }} alGuardar={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('no cae dentro de L-A')
  })

  it('no cambia un atrayente escrito a mano al cambiar el tipo', async () => {
    const usuarioEvento = userEvent.setup()
    render(<ConEstado alGuardar={vi.fn()} />)

    const atrayente = screen.getByLabelText('Atrayente')
    await usuarioEvento.clear(atrayente)
    await usuarioEvento.type(atrayente, 'Cebo casero')
    await usuarioEvento.click(screen.getByRole('radio', { name: /McPhail/ }))
    expect(atrayente).toHaveValue('Cebo casero')
  })

  it('muestra el mensaje del servidor si el punto queda fuera del lote', async () => {
    simularFetch(
      respuestaJson(422, {
        detail: 'La ubicación de la trampa debe quedar dentro del polígono de su lote',
      }),
    )
    const usuarioEvento = userEvent.setup()
    render(<ConEstado lote="l-a" inicial={{ lat: '7.2705', lng: '-72.635' }} alGuardar={vi.fn()} />)

    await usuarioEvento.type(screen.getByLabelText('Código ICA (oficial)'), 'ICA-003')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar y generar QR' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('dentro del polígono de su lote')
  })

  it('al editar sin mover no envía la ubicación y conserva la precisión del GPS', async () => {
    const fetchSimulado = simularFetch(respuestaJson(200, { ...TRAMPA, estado: 'inactiva' }))
    const usuarioEvento = userEvent.setup()
    render(
      <ConEstado
        trampa={TRAMPA}
        lote="l-a"
        inicial={{ lat: '7.2705', lng: '-72.6395' }}
        alGuardar={vi.fn()}
      />,
    )

    expect(screen.getByText('Precisión del GPS: ±4.5 m')).toBeInTheDocument()
    await usuarioEvento.selectOptions(screen.getByLabelText('Estado'), 'inactiva')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(fetchSimulado.mock.calls[0][0]).toBe('/api/v1/trampas/t-1')
    const cuerpo = cuerpoEnviado(fetchSimulado)
    expect(cuerpo.estado).toBe('inactiva')
    expect(cuerpo).not.toHaveProperty('geom')
  })

  it('al mover la trampa envía el punto nuevo y borra la precisión', async () => {
    const fetchSimulado = simularFetch(respuestaJson(200, TRAMPA))
    const usuarioEvento = userEvent.setup()
    render(
      <ConEstado
        trampa={TRAMPA}
        lote="l-a"
        inicial={{ lat: '7.2705', lng: '-72.6395' }}
        alGuardar={vi.fn()}
      />,
    )

    const latitud = screen.getByLabelText('Latitud')
    await usuarioEvento.clear(latitud)
    await usuarioEvento.type(latitud, '7.2708')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(cuerpoEnviado(fetchSimulado)).toMatchObject({
      geom: { type: 'Point', coordinates: [-72.6395, 7.2708] },
      precision_m: null,
    })
  })

  it('sin permiso solo consulta', () => {
    render(
      <ConEstado
        trampa={TRAMPA}
        lote="l-a"
        inicial={{ lat: '7.2705', lng: '-72.6395' }}
        editable={false}
      />,
    )
    expect(screen.getByLabelText('Código ICA (oficial)')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ubicar en el mapa' })).not.toBeInTheDocument()
  })

  it('usa la ubicación del teléfono y envía su precisión', async () => {
    obtenerUbicacion.mockImplementation(async ({ alAvanzar }) => {
      alAvanzar({ lat: 7.2705, lng: -72.6295, precision: 23 })
      return { lat: 7.2705, lng: -72.6295, precision: 4.567 }
    })
    const fetchSimulado = simularFetch(respuestaJson(201, TRAMPA))
    const usuarioEvento = userEvent.setup()
    render(<ConEstado lote="l-b" alGuardar={vi.fn()} />)

    await usuarioEvento.click(screen.getByRole('button', { name: 'Usar mi ubicación' }))

    expect(screen.getByLabelText('Latitud')).toHaveValue(7.2705)
    expect(screen.getByText('Ubicación del GPS con precisión de ±5 m.')).toBeInTheDocument()
    await usuarioEvento.type(screen.getByLabelText('Código ICA (oficial)'), 'ICA-GPS')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar y generar QR' }))

    expect(cuerpoEnviado(fetchSimulado)).toMatchObject({
      geom: { type: 'Point', coordinates: [-72.6295, 7.2705] },
      precision_m: 4.57,
    })
  })

  it('advierte si la precisión supera el umbral', async () => {
    obtenerUbicacion.mockResolvedValue({ lat: 7.2705, lng: -72.6295, precision: 35 })
    render(<ConEstado lote="l-b" alGuardar={vi.fn()} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Usar mi ubicación' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La precisión del GPS (±35 m) supera los 10 m recomendados',
    )
  })

  it('si después se cambia el punto a mano, ya no envía la precisión del GPS', async () => {
    obtenerUbicacion.mockResolvedValue({ lat: 7.2705, lng: -72.6295, precision: 4 })
    const fetchSimulado = simularFetch(respuestaJson(201, TRAMPA))
    const usuarioEvento = userEvent.setup()
    render(<ConEstado lote="l-b" alGuardar={vi.fn()} />)

    await usuarioEvento.click(screen.getByRole('button', { name: 'Usar mi ubicación' }))
    const latitud = screen.getByLabelText('Latitud')
    await usuarioEvento.clear(latitud)
    await usuarioEvento.type(latitud, '7.2707')
    await usuarioEvento.type(screen.getByLabelText('Código ICA (oficial)'), 'ICA-MANO')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar y generar QR' }))

    expect(cuerpoEnviado(fetchSimulado)).not.toHaveProperty('precision_m')
  })

  it('muestra el error del GPS', async () => {
    obtenerUbicacion.mockRejectedValue(new Error('No dio permiso para usar la ubicación.'))
    render(<ConEstado lote="l-b" alGuardar={vi.fn()} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Usar mi ubicación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No dio permiso')
  })
})
