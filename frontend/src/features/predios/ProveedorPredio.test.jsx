import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ContextoSesion } from '../auth/useSesion'
import { respuestaJson } from '../../test/utilidades'
import { ProveedorPredio } from './ProveedorPredio'
import { usePredio } from './usePredio'

const PREDIOS = [
  { id: 'p-1', nombre: 'Finca Icota' },
  { id: 'p-2', nombre: 'Finca La Loma' },
]

function PredioActual() {
  const { predio, seleccionar } = usePredio()
  if (!predio) return <p>Cargando…</p>
  return (
    <>
      <p>Predio actual: {predio.nombre}</p>
      <button type="button" onClick={() => seleccionar('p-2')}>
        Elegir La Loma
      </button>
    </>
  )
}

function renderizar() {
  return render(
    <ContextoSesion.Provider value={{ usuario: { id: 'u-1', rol: 'agronomo' }, salir: vi.fn() }}>
      <ProveedorPredio>
        <PredioActual />
      </ProveedorPredio>
    </ContextoSesion.Provider>,
  )
}

describe('ProveedorPredio', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuestaJson(200, PREDIOS)),
    )
  })
  afterEach(() => localStorage.clear())

  it('recuerda el predio elegido al volver a abrir la página', async () => {
    const usuarioEvento = userEvent.setup()
    const { unmount } = renderizar()
    expect(await screen.findByText('Predio actual: Finca Icota')).toBeInTheDocument()
    await usuarioEvento.click(screen.getByRole('button', { name: 'Elegir La Loma' }))
    expect(screen.getByText('Predio actual: Finca La Loma')).toBeInTheDocument()

    // Recargar: se monta de nuevo y lee la elección guardada en el navegador.
    unmount()
    renderizar()
    expect(await screen.findByText('Predio actual: Finca La Loma')).toBeInTheDocument()
  })

  it('si el predio recordado ya no está asignado, usa el primero', async () => {
    localStorage.setItem('icota.predio', 'p-borrado')
    renderizar()
    expect(await screen.findByText('Predio actual: Finca Icota')).toBeInTheDocument()
  })
})
