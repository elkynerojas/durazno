import { describe, expect, it, vi } from 'vitest'

import { guardarToken, leerToken, leerTokenRenovacion } from '../features/auth/sesion'
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

    await iniciarSesion('tecnico1@ejemplo.com', 'clave')

    const [url, opciones] = fetchSimulado.mock.calls[0]
    expect(url).toBe('/api/v1/auth/token')
    expect(opciones.body.get('username')).toBe('tecnico1@ejemplo.com')
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

  it('cierra la sesión cuando la API rechaza el token y no hay renovación', async () => {
    guardarToken('vencido')
    simularFetch(respuestaJson(401, { detail: 'Sesión inválida o expirada' }))
    const alCerrar = vi.fn()
    window.addEventListener(EVENTO_SESION_CERRADA, alCerrar)

    await expect(api('/auth/yo')).rejects.toBeInstanceOf(ErrorApi)

    expect(alCerrar).toHaveBeenCalledOnce()
    expect(leerToken()).toBeNull()
    window.removeEventListener(EVENTO_SESION_CERRADA, alCerrar)
  })

  it('renueva el token tras un 401 y repite la petición', async () => {
    guardarToken('vencido', 'renovacion-1')
    const fetchSimulado = simularFetch(
      respuestaJson(401, { detail: 'Sesión inválida o expirada' }),
      respuestaJson(200, { access_token: 'nuevo', refresh_token: 'renovacion-2' }),
      respuestaJson(200, { correo: 'a@ejemplo.com' }),
    )

    await expect(api('/auth/yo')).resolves.toEqual({ correo: 'a@ejemplo.com' })

    const [urlRenovar, opcionesRenovar] = fetchSimulado.mock.calls[1]
    expect(urlRenovar).toBe('/api/v1/auth/renovar')
    expect(JSON.parse(opcionesRenovar.body)).toEqual({ refresh_token: 'renovacion-1' })
    expect(fetchSimulado.mock.calls[2][1].headers.Authorization).toBe('Bearer nuevo')
    expect(leerToken()).toBe('nuevo')
    expect(leerTokenRenovacion()).toBe('renovacion-2')
  })

  it('comparte una sola renovación entre peticiones simultáneas', async () => {
    guardarToken('vencido', 'renovacion-1')
    const fetchSimulado = simularFetch(
      respuestaJson(401, {}),
      respuestaJson(401, {}),
      respuestaJson(200, { access_token: 'nuevo', refresh_token: 'renovacion-2' }),
      respuestaJson(200, { a: 1 }),
      respuestaJson(200, { b: 2 }),
    )

    await Promise.all([api('/a'), api('/b')])

    const renovaciones = fetchSimulado.mock.calls.filter(([url]) => url.endsWith('/auth/renovar'))
    expect(renovaciones).toHaveLength(1)
  })

  it('cierra la sesión si la renovación falla', async () => {
    guardarToken('vencido', 'renovacion-vencida')
    const fetchSimulado = simularFetch(respuestaJson(401, {}), respuestaJson(401, {}))
    const alCerrar = vi.fn()
    window.addEventListener(EVENTO_SESION_CERRADA, alCerrar)

    const error = await api('/auth/yo').catch((e) => e)

    expect(error.estado).toBe(401)
    expect(fetchSimulado).toHaveBeenCalledTimes(2)
    expect(alCerrar).toHaveBeenCalledOnce()
    expect(leerTokenRenovacion()).toBeNull()
    window.removeEventListener(EVENTO_SESION_CERRADA, alCerrar)
  })
})
