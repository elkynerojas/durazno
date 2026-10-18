import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { obtenerUbicacion } from '../../utils/ubicacion'
import { respuestaJson } from '../../test/utilidades'
import FormularioLectura from './FormularioLectura'

vi.mock('../../utils/ubicacion', () => ({ obtenerUbicacion: vi.fn() }))

const TRAMPA = {
  id: 't-1',
  codigo_ica: 'ICA-0031',
  tipo: 'jackson',
  geom: { type: 'Point', coordinates: [-72.6395, 7.2705] },
}
const PREPARACION = {
  trampa_id: 't-1',
  revision_anterior: '2026-10-06',
  dias_exposicion: 7,
  ultima_lectura: null,
}

// La API simulada responde según la ruta: preparar (GET) y registrar (POST).
function simularApi() {
  const fetchSimulado = vi.fn(async (url, opciones) =>
    opciones?.method === 'POST'
      ? respuestaJson(201, { id: 'l-1', ...JSON.parse(opciones.body) })
      : respuestaJson(200, PREPARACION),
  )
  vi.stubGlobal('fetch', fetchSimulado)
  return fetchSimulado
}

const cuerpoEnviado = (fetchSimulado) =>
  JSON.parse(fetchSimulado.mock.calls.find(([, o]) => o?.method === 'POST')[1].body)

function renderizar() {
  const alGuardar = vi.fn()
  render(<FormularioLectura trampa={TRAMPA} alGuardar={alGuardar} />)
  return alGuardar
}

describe('FormularioLectura', () => {
  beforeEach(() => {
    // 0,0001° al norte de la trampa: ≈ 11 m.
    obtenerUbicacion.mockResolvedValue({ lat: 7.2706, lng: -72.6395, precision: 4.2 })
  })

  it('propone los días calculados, cuenta capturas y envía la ubicación', async () => {
    const fetchSimulado = simularApi()
    const usuarioEvento = userEvent.setup()
    const alGuardar = renderizar()

    await waitFor(() => expect(screen.getByLabelText('Días de exposición')).toHaveValue(7))
    expect(screen.getByText(/Instalada el: 06\/10\/2026/)).toBeInTheDocument()
    expect(await screen.findByText(/±4 m · a ≈ 11 m de la trampa/)).toBeInTheDocument()

    for (let i = 0; i < 4; i++) {
      await usuarioEvento.click(
        screen.getByRole('button', { name: 'Sumar Ceratitis capitata machos' }),
      )
    }
    await usuarioEvento.click(
      screen.getByRole('button', { name: 'Sumar Ceratitis capitata hembras' }),
    )
    await usuarioEvento.click(screen.getByRole('button', { name: 'Sumar Anastrepha spp.' }))
    await usuarioEvento.click(screen.getByRole('button', { name: 'Restar Anastrepha spp.' }))
    // Jackson vigila C. capitata: 5 ÷ (1 × 7) = 0,71.
    expect(screen.getByText('5 ÷ (1 × 7) = 0,71')).toBeInTheDocument()
    await usuarioEvento.click(screen.getByRole('radio', { name: 'Dañada' }))
    await usuarioEvento.click(screen.getByRole('radio', { name: 'Sí' }))
    await usuarioEvento.type(screen.getByLabelText('Observaciones'), 'Frutos picados')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Registrar lectura' }))

    const { id, observado_en, ...cuerpo } = cuerpoEnviado(fetchSimulado)
    expect(id).toEqual(expect.any(String))
    expect(observado_en).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00-05:00$/)
    expect(cuerpo).toEqual({
      trampa_id: 't-1',
      capitata_machos: 4,
      capitata_hembras: 1,
      anastrepha: 0,
      dias_exposicion: 7,
      estado_trampa: 'danada',
      cambio_atrayente: true,
      observaciones: 'Frutos picados',
      posicion: { type: 'Point', coordinates: [-72.6395, 7.2706] },
      precision_m: 4.2,
    })
    expect(alGuardar).toHaveBeenCalled()
  })

  it('cambiar los días exige una justificación', async () => {
    const fetchSimulado = simularApi()
    const usuarioEvento = userEvent.setup()
    renderizar()
    const dias = screen.getByLabelText('Días de exposición')
    await waitFor(() => expect(dias).toHaveValue(7))

    await usuarioEvento.clear(dias)
    await usuarioEvento.type(dias, '6')
    const boton = screen.getByRole('button', { name: 'Registrar lectura' })
    expect(boton).toBeDisabled()
    await usuarioEvento.type(
      screen.getByLabelText('¿Por qué cambia los días?'),
      'Se revisó el día 7 sin registrar',
    )
    await usuarioEvento.click(boton)
    expect(cuerpoEnviado(fetchSimulado)).toMatchObject({
      dias_exposicion: 6,
      justificacion_dias: 'Se revisó el día 7 sin registrar',
    })
  })

  it('sin GPS registra igual, sin posición', async () => {
    obtenerUbicacion.mockRejectedValue(new Error('No dio permiso para usar la ubicación.'))
    const fetchSimulado = simularApi()
    const usuarioEvento = userEvent.setup()
    renderizar()
    expect(
      await screen.findByText(/Sin ubicación: No dio permiso para usar la ubicación\./),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Días de exposición')).toHaveValue(7))
    await usuarioEvento.click(screen.getByRole('button', { name: 'Registrar lectura' }))
    const cuerpo = cuerpoEnviado(fetchSimulado)
    expect(cuerpo).not.toHaveProperty('posicion')
    expect(cuerpo).not.toHaveProperty('precision_m')
  })
})
