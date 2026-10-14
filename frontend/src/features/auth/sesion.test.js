import { describe, expect, it, vi } from 'vitest'

import { borrarToken, guardarToken, leerToken, leerTokenRenovacion } from './sesion'

describe('sesion', () => {
  it('guarda, lee y borra los tokens en localStorage', () => {
    guardarToken('abc', 'def')
    expect(localStorage.getItem('icota.token')).toBe('abc')
    expect(localStorage.getItem('icota.renovacion')).toBe('def')
    expect(leerToken()).toBe('abc')
    expect(leerTokenRenovacion()).toBe('def')

    borrarToken()
    expect(leerToken()).toBeNull()
    expect(leerTokenRenovacion()).toBeNull()
  })

  it('conserva el token en memoria si localStorage no está disponible', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })

    guardarToken('xyz', 'uvw')
    expect(leerToken()).toBe('xyz')
    expect(leerTokenRenovacion()).toBe('uvw')

    borrarToken()
    expect(leerToken()).toBeNull()
    expect(leerTokenRenovacion()).toBeNull()
  })
})
