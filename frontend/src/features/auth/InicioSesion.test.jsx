import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ErrorApi } from '../../api/client'
import InicioSesion from './InicioSesion'
import { ContextoSesion } from './useSesion'

// EstadoApi consulta /health; aquí no interesa.
vi.mock('../../components/EstadoApi', () => ({ default: () => null }))

function renderizar(entrar, desde) {
  render(
    <ContextoSesion.Provider value={{ usuario: null, cargando: false, entrar }}>
      <MemoryRouter initialEntries={[{ pathname: '/', state: desde && { desde } }]}>
        <Routes>
          <Route path="/" element={<InicioSesion />} />
          <Route path="/mapa" element={<p>Vista del mapa</p>} />
          <Route path="/t/:codigo" element={<p>Ficha de la trampa</p>} />
        </Routes>
      </MemoryRouter>
    </ContextoSesion.Provider>,
  )
}

async function ingresar(correo, clave) {
  const usuarioEvento = userEvent.setup()
  await usuarioEvento.type(screen.getByLabelText('Correo electrónico'), correo)
  await usuarioEvento.type(screen.getByLabelText('Contraseña'), clave)
  await usuarioEvento.click(screen.getByRole('button', { name: 'Ingresar' }))
}

describe('InicioSesion', () => {
  it('entra con el correo y va al mapa', async () => {
    const entrar = vi.fn().mockResolvedValue()
    renderizar(entrar)

    await ingresar('tecnico1@ejemplo.com', 'clave-segura')

    expect(entrar).toHaveBeenCalledWith('tecnico1@ejemplo.com', 'clave-segura')
    expect(await screen.findByText('Vista del mapa')).toBeInTheDocument()
  })

  it('muestra el mensaje del servidor ante credenciales inválidas', async () => {
    const entrar = vi.fn().mockRejectedValue(new ErrorApi(401, 'Correo o contraseña incorrectos'))
    renderizar(entrar)

    await ingresar('tecnico1@ejemplo.com', 'mala')

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos')
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled()
  })

  it('muestra un mensaje genérico ante otros errores', async () => {
    const entrar = vi.fn().mockRejectedValue(new ErrorApi(500, 'Traza interna'))
    renderizar(entrar)

    await ingresar('tecnico1@ejemplo.com', 'clave')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo iniciar sesión. Intente de nuevo.',
    )
  })

  it('muestra el aviso del servidor ante demasiados intentos', async () => {
    const aviso = 'Demasiados intentos. Intente de nuevo en unos minutos.'
    const entrar = vi.fn().mockRejectedValue(new ErrorApi(429, aviso))
    renderizar(entrar)

    await ingresar('tecnico1@ejemplo.com', 'clave')

    expect(await screen.findByRole('alert')).toHaveTextContent(aviso)
  })

  it('vuelve a la ficha del QR escaneado antes de iniciar sesión', async () => {
    renderizar(vi.fn().mockResolvedValue(), '/t/ABCD2345')
    await ingresar('tecnico1@ejemplo.com', 'clave-segura')
    expect(await screen.findByText('Ficha de la trampa')).toBeInTheDocument()
  })

  it.each(['//otro-sitio.com/robar', 'https://otro-sitio.com', '/'])(
    'ignora un destino externo o vacío (%s) y va al mapa',
    async (desde) => {
      renderizar(vi.fn().mockResolvedValue(), desde)
      await ingresar('tecnico1@ejemplo.com', 'clave-segura')
      expect(await screen.findByText('Vista del mapa')).toBeInTheDocument()
    },
  )
})
