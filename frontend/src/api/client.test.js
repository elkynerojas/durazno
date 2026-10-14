import { describe, expect, it, vi } from 'vitest'

import { guardarToken, leerToken } from '../features/auth/sesion'
import { simularFetch, respuestaJson } from '../test/utilidades'
import { api, ErrorApi, EVENTO_SESION_CERRADA, iniciarSesion } from './client'

describe('cliente de la API', () => {
  it('usa rutas relativas a /api/v1 y envía el token de la sesión', async () => {
    guardarToken('token-123')
    const fetchSimulado = simularFetch(respuestaJson(200, { estado: 'ok' }))

    await expect(api('/health')).resolves.toEqual({ estado: 'ok' })

    const [url, opciones] = fetchSimulado.mock.calls[0]
    expect(url).toBe('/api/v1/health')
    expect(opciones.headers.Authorization).toBe('Bearer token-123')
  })

  it('envía el inicio de sesión como formulario sin Content-Type JSON', async () => {
    const fetchSimulado = simularFetch(respuestaJson(200, { access_token: 't' }))

    await iniciarSesion('tecnico1', 'clave')

    const [, opciones] = fetchSimulado.mock.calls[0]
    expect(opciones.method).toBe('POST')
    expect(opciones.body).toBeInstanceOf(URLSearchParams)
    expect(opciones.headers['Content-Type']).toBeUndefined()
  })

  it('lanza ErrorApi con el detalle del servidor', async () => {
    simularFetch(respuestaJson(409, { detail: 'El código ICA ya existe' }))

    const error = await api('/trampas', { metodo: 'POST', cuerpo: {} }).catch((e) => e)

    expect(error).toBeInstanceOf(ErrorApi)
    expect(error.estado).toBe(409)
    expect(error.message).toBe('El código ICA ya existe')
  })

  it('cierra la sesión cuando la API rechaza el token', async () => {
    guardarToken('vencido')
    simularFetch(respuestaJson(401, { detail: 'Sesión inválida o expirada' }))
    const alCerrar = vi.fn()
    window.addEventListener(EVENTO_SESION_CERRADA, alCerrar)

    await expect(api('/auth/yo')).rejects.toBeInstanceOf(ErrorApi)

    expect(alCerrar).toHaveBeenCalledOnce()
    expect(leerToken()).toBeNull()
    window.removeEventListener(EVENTO_SESION_CERRADA, alCerrar)
  })
})
