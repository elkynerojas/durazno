import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ErrorApi } from '../../api/client'
import InicioSesion from './InicioSesion'
import { ContextoSesion } from './useSesion'

// EstadoApi consulta /health; aquí no interesa.
vi.mock('../../components/EstadoApi', () => ({ default: () => null }))

function renderizar(entrar) {
  render(
    <ContextoSesion.Provider value={{ usuario: null, cargando: false, entrar }}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<InicioSesion />} />
          <Route path="/mapa" element={<p>Vista del mapa</p>} />
        </Routes>
      </MemoryRouter>
    </ContextoSesion.Provider>,
  )
}

async function ingresar(usuario, clave) {
  const usuarioEvento = userEvent.setup()
  await usuarioEvento.type(screen.getByLabelText('Usuario'), usuario)
  await usuarioEvento.type(screen.getByLabelText('Contraseña'), clave)
  await usuarioEvento.click(screen.getByRole('button', { name: 'Ingresar' }))
}

describe('InicioSesion', () => {
  it('entra con usuario sin espacios y va al mapa', async () => {
    const entrar = vi.fn().mockResolvedValue()
    renderizar(entrar)

    await ingresar('  tecnico1 ', 'clave-segura')

    expect(entrar).toHaveBeenCalledWith('tecnico1', 'clave-segura')
    expect(await screen.findByText('Vista del mapa')).toBeInTheDocument()
  })

  it('muestra el mensaje del servidor ante credenciales inválidas', async () => {
    const entrar = vi.fn().mockRejectedValue(new ErrorApi(401, 'Usuario o contraseña incorrectos'))
    renderizar(entrar)

    await ingresar('tecnico1', 'mala')

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos')
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled()
  })

  it('muestra un mensaje genérico ante otros errores', async () => {
    const entrar = vi.fn().mockRejectedValue(new ErrorApi(500, 'Traza interna'))
    renderizar(entrar)

    await ingresar('tecnico1', 'clave')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo iniciar sesión. Intente de nuevo.',
    )
  })
})
