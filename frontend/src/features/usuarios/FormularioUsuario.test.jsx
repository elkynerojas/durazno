import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import FormularioUsuario from './FormularioUsuario'

const EXISTENTE = {
  id: 'u-1',
  nombre_completo: 'Ana Pérez',
  correo: 'ana@ejemplo.com',
  rol: 'tecnico',
  activo: true,
}

async function llenarNuevo(usuarioEvento, { autorizar = true } = {}) {
  await usuarioEvento.type(screen.getByLabelText('Nombre completo'), 'Luis Gómez')
  await usuarioEvento.type(screen.getByLabelText('Correo'), 'luis@ejemplo.com')
  await usuarioEvento.selectOptions(screen.getByLabelText('Rol'), 'productor')
  await usuarioEvento.type(screen.getByLabelText('Contraseña inicial'), 'clave-segura-1')
  if (autorizar) await usuarioEvento.click(screen.getByRole('checkbox'))
}

describe('FormularioUsuario', () => {
  it('crea la cuenta con id del cliente y autorización de datos', async () => {
    const fetchSimulado = simularFetch(respuestaJson(201, { ...EXISTENTE, id: 'nuevo' }))
    const alGuardar = vi.fn()
    const usuarioEvento = userEvent.setup()
    render(<FormularioUsuario alGuardar={alGuardar} alCancelar={vi.fn()} />)

    expect(screen.getByText('Aviso de tratamiento de datos personales')).toBeInTheDocument()
    await llenarNuevo(usuarioEvento)
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    const [url, opciones] = fetchSimulado.mock.calls[0]
    expect(url).toBe('/api/v1/usuarios')
    expect(opciones.method).toBe('POST')
    const cuerpo = JSON.parse(opciones.body)
    expect(cuerpo).toMatchObject({
      nombre_completo: 'Luis Gómez',
      correo: 'luis@ejemplo.com',
      rol: 'productor',
      clave: 'clave-segura-1',
      autorizacion_datos: true,
    })
    expect(cuerpo.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({ id: 'nuevo' }), {
      claveCambiada: false,
    })
  })

  it('no envía sin la autorización del titular', async () => {
    const fetchSimulado = simularFetch()
    const usuarioEvento = userEvent.setup()
    render(<FormularioUsuario alGuardar={vi.fn()} alCancelar={vi.fn()} />)

    await llenarNuevo(usuarioEvento, { autorizar: false })
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(fetchSimulado).not.toHaveBeenCalled()
  })

  it('edita sin enviar la clave si se deja vacía', async () => {
    const fetchSimulado = simularFetch(respuestaJson(200, { ...EXISTENTE, rol: 'agronomo' }))
    const usuarioEvento = userEvent.setup()
    render(<FormularioUsuario usuario={EXISTENTE} alGuardar={vi.fn()} alCancelar={vi.fn()} />)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await usuarioEvento.selectOptions(screen.getByLabelText('Rol'), 'agronomo')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    const [url, opciones] = fetchSimulado.mock.calls[0]
    expect(url).toBe('/api/v1/usuarios/u-1')
    expect(opciones.method).toBe('PATCH')
    expect(JSON.parse(opciones.body)).toEqual({
      nombre_completo: 'Ana Pérez',
      correo: 'ana@ejemplo.com',
      rol: 'agronomo',
    })
  })

  it('bloquea el cambio de rol en la propia cuenta', () => {
    render(
      <FormularioUsuario usuario={EXISTENTE} esPropio alGuardar={vi.fn()} alCancelar={vi.fn()} />,
    )
    expect(screen.getByLabelText('Rol')).toBeDisabled()
  })

  it('muestra el mensaje del servidor si el correo ya existe', async () => {
    simularFetch(respuestaJson(409, { detail: 'Ya existe un usuario con ese correo' }))
    const usuarioEvento = userEvent.setup()
    render(<FormularioUsuario alGuardar={vi.fn()} alCancelar={vi.fn()} />)

    await llenarNuevo(usuarioEvento)
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un usuario con ese correo',
    )
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  })

  it('para cambiar la propia contraseña pide la actual y avisa que se cerrarán las sesiones', async () => {
    const fetchSimulado = simularFetch(respuestaJson(200, { id: 'yo', nombre_completo: 'Ana' }))
    const alGuardar = vi.fn()
    const usuarioEvento = userEvent.setup()
    render(
      <FormularioUsuario
        usuario={{ id: 'yo', nombre_completo: 'Ana', correo: 'ana@ejemplo.com', rol: 'agronomo' }}
        esPropio
        alGuardar={alGuardar}
        alCancelar={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Contraseña actual')).not.toBeInTheDocument()
    await usuarioEvento.type(
      screen.getByLabelText('Nueva contraseña (opcional)'),
      'Durazno-en-flor-26',
    )
    expect(screen.getByText(/se cerrarán todas sus sesiones/)).toBeInTheDocument()
    await usuarioEvento.type(screen.getByLabelText('Contraseña actual'), 'clave-vieja-123')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(JSON.parse(fetchSimulado.mock.calls[0][1].body)).toMatchObject({
      clave: 'Durazno-en-flor-26',
      clave_actual: 'clave-vieja-123',
    })
    expect(alGuardar).toHaveBeenCalledWith(expect.anything(), { claveCambiada: true })
  })

  it('muestra el motivo si el servidor rechaza una contraseña trivial', async () => {
    simularFetch(
      respuestaJson(422, {
        detail: 'La contraseña es demasiado común; use una frase o combinación propia',
      }),
    )
    const usuarioEvento = userEvent.setup()
    render(
      <FormularioUsuario
        usuario={{ id: 't', nombre_completo: 'Téc', correo: 't@ejemplo.com', rol: 'tecnico' }}
        alGuardar={vi.fn()}
        alCancelar={vi.fn()}
      />,
    )
    await usuarioEvento.type(screen.getByLabelText('Nueva contraseña (opcional)'), '12345678')
    await usuarioEvento.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('demasiado común')
  })
})
