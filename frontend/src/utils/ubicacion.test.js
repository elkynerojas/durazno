import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { obtenerUbicacion } from './ubicacion'

// Geolocation falsa: guarda los callbacks para emitir lecturas desde la prueba.
function simularGps() {
  const gps = { watchPosition: vi.fn(), clearWatch: vi.fn() }
  gps.watchPosition.mockImplementation((exito, fallo, opciones) => {
    gps.exito = exito
    gps.fallo = fallo
    gps.opciones = opciones
    return 7
  })
  gps.lectura = (latitude, longitude, accuracy) =>
    gps.exito({ coords: { latitude, longitude, accuracy } })
  vi.stubGlobal('navigator', { geolocation: gps })
  return gps
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('isSecureContext', true)
})

afterEach(() => vi.useRealTimers())

describe('obtenerUbicacion', () => {
  it('pide alta precisión y se queda con la mejor lectura hasta alcanzar el objetivo', async () => {
    const gps = simularGps()
    const alAvanzar = vi.fn()
    const promesa = obtenerUbicacion({ objetivoM: 5, alAvanzar })

    expect(gps.opciones).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 })
    gps.lectura(7.27, -72.64, 30)
    gps.lectura(7.271, -72.641, 40) // peor: se ignora
    gps.lectura(7.2705, -72.6395, 4)

    await expect(promesa).resolves.toEqual({ lat: 7.2705, lng: -72.6395, precision: 4 })
    expect(alAvanzar.mock.calls.map(([l]) => l.precision)).toEqual([30, 4])
    expect(gps.clearWatch).toHaveBeenCalledWith(7)
  })

  it('al vencer el tiempo entrega la mejor lectura obtenida', async () => {
    const gps = simularGps()
    const promesa = obtenerUbicacion({ duracionMs: 10_000 })
    gps.lectura(7.27, -72.64, 18)
    vi.advanceTimersByTime(10_000)
    await expect(promesa).resolves.toMatchObject({ precision: 18 })
  })

  it('explica en español si no hay permiso', async () => {
    const gps = simularGps()
    const promesa = obtenerUbicacion()
    gps.fallo({ code: 1 })
    await expect(promesa).rejects.toThrow('No dio permiso para usar la ubicación')
  })

  it('sin ninguna lectura a tiempo avisa que el GPS tardó demasiado', async () => {
    simularGps()
    const promesa = obtenerUbicacion({ duracionMs: 5_000 })
    vi.advanceTimersByTime(5_000)
    await expect(promesa).rejects.toThrow('El GPS tardó demasiado')
  })

  it('exige HTTPS', async () => {
    simularGps()
    vi.stubGlobal('isSecureContext', false)
    await expect(obtenerUbicacion()).rejects.toThrow('solo funciona con la página abierta en HTTPS')
  })
})
