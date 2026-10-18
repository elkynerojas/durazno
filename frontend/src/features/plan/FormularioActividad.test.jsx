import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import FormularioActividad from './FormularioActividad'

const LOTES = [
  { id: 'l-1', codigo: 'L-01', nombre: null },
  { id: 'l-2', codigo: 'L-02', nombre: 'Alto' },
]
const PERSONAL = [{ id: 'u-1', nombre_completo: 'Ana Técnica', rol: 'tecnico' }]
const cuerpoEnviado = (fetchSimulado) => JSON.parse(fetchSimulado.mock.calls.at(-1)[1].body)

function renderizar(props = {}) {
  const alGuardar = vi.fn()
  render(
    <FormularioActividad
      anio={2026}
      semanaInicial={42}
      lotes={LOTES}
      lotesConRuta={new Set(['l-1'])}
      personal={PERSONAL}
      alGuardar={alGuardar}
      alCancelar={vi.fn()}
      {...props}
    />,
  )
  return alGuardar
}

describe('FormularioActividad', () => {
  it('programa una labor que se repite cada N semanas', async () => {
    const creadas = [{ id: 'a-1', semana: 10 }]
    const fetchSimulado = simularFetch(respuestaJson(201, creadas))
    const usuarioEvento = userEvent.setup()
    const alGuardar = renderizar()

    await usuarioEvento.click(screen.getByRole('radio', { name: 'Labor cultural' }))
    await usuarioEvento.selectOptions(screen.getByLabelText('Labor'), 'raleo')
    await usuarioEvento.selectOptions(screen.getByLabelText('Lote'), 'l-2')
    const semana = screen.getByLabelText('Semana')
    await usuarioEvento.clear(semana)
    await usuarioEvento.type(semana, '10')
    expect(screen.getByText('2–8 mar 2026')).toBeInTheDocument()
    await usuarioEvento.click(screen.getByRole('checkbox', { name: 'Repetir' }))
    const cada = screen.getByLabelText('Cada (semanas)')
    await usuarioEvento.clear(cada)
    await usuarioEvento.type(cada, '4')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Programar' }))

    const { id, ...cuerpo } = cuerpoEnviado(fetchSimulado)
    expect(id).toEqual(expect.any(String))
    expect(cuerpo).toEqual({
      lote_id: 'l-2',
      tipo: 'labor_cultural',
      labor: 'raleo',
      anio: 2026,
      semana: 10,
      responsable_id: 'u-1',
      repetir: { cada_semanas: 4, hasta_semana: 53 },
    })
    expect(alGuardar).toHaveBeenCalledWith(creadas)
  })

  it('no deja programar visitas en un lote sin ruta', async () => {
    const usuarioEvento = userEvent.setup()
    renderizar()
    expect(screen.getByRole('radio', { name: 'Visita de monitoreo' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Programar' })).toBeEnabled()

    await usuarioEvento.selectOptions(screen.getByLabelText('Lote'), 'l-2')
    expect(screen.getByRole('status')).toHaveTextContent('Este lote no tiene ruta')
    expect(screen.getByRole('button', { name: 'Programar' })).toBeDisabled()
  })

  it('muestra el error de la API', async () => {
    simularFetch(respuestaJson(422, { detail: 'El año 2026 tiene 53 semanas ISO' }))
    const usuarioEvento = userEvent.setup()
    renderizar()
    await usuarioEvento.click(screen.getByRole('button', { name: 'Programar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El año 2026 tiene 53 semanas ISO')
  })
})
