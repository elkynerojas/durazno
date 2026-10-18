import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import Reprogramar from './Reprogramar'

const ACTIVIDAD = { id: 'a-1', anio: 2026, semana: 42 }

function renderizar() {
  const alReprogramar = vi.fn()
  render(<Reprogramar actividad={ACTIVIDAD} alReprogramar={alReprogramar} alCancelar={vi.fn()} />)
  return alReprogramar
}

describe('Reprogramar', () => {
  it('exige otra semana y un motivo antes de enviar', async () => {
    const movida = { ...ACTIVIDAD, semana: 44, estado: 'reprogramada' }
    const fetchSimulado = simularFetch(respuestaJson(200, movida))
    const usuarioEvento = userEvent.setup()
    const alReprogramar = renderizar()
    const boton = screen.getByRole('button', { name: 'Reprogramar' })

    expect(boton).toBeDisabled()
    const semana = screen.getByLabelText('Nueva semana')
    await usuarioEvento.clear(semana)
    await usuarioEvento.type(semana, '44')
    expect(screen.getByText('26 oct – 1 nov 2026')).toBeInTheDocument()
    expect(boton).toBeDisabled()
    await usuarioEvento.type(screen.getByLabelText('Motivo'), 'Aumento de capturas')
    await usuarioEvento.click(boton)

    const [ruta, opciones] = fetchSimulado.mock.calls[0]
    expect(ruta).toBe('/api/v1/plan/a-1/reprogramar')
    const { id, ...cuerpo } = JSON.parse(opciones.body)
    expect(id).toEqual(expect.any(String))
    expect(cuerpo).toEqual({ anio: 2026, semana: 44, motivo: 'Aumento de capturas' })
    expect(alReprogramar).toHaveBeenCalledWith(movida)
  })

  it('permite pasarla al año siguiente y muestra el error de la API', async () => {
    simularFetch(respuestaJson(422, { detail: 'El año 2027 tiene 52 semanas ISO' }))
    const usuarioEvento = userEvent.setup()
    renderizar()
    await usuarioEvento.selectOptions(screen.getByLabelText('Año'), '2027')
    await usuarioEvento.type(screen.getByLabelText('Motivo'), 'Se aplaza la labor')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Reprogramar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El año 2027 tiene 52 semanas ISO')
  })
})
