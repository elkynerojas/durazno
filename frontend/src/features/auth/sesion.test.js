import { describe, expect, it, vi } from 'vitest'

import { borrarToken, guardarToken, leerToken } from './sesion'

describe('sesion', () => {
  it('guarda, lee y borra el token en localStorage', () => {
    guardarToken('abc')
    expect(localStorage.getItem('icota.token')).toBe('abc')
    expect(leerToken()).toBe('abc')

    borrarToken()
    expect(leerToken()).toBeNull()
  })

  it('conserva el token en memoria si localStorage no está disponible', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })

    guardarToken('xyz')
    expect(leerToken()).toBe('xyz')

    borrarToken()
    expect(leerToken()).toBeNull()
  })
})
