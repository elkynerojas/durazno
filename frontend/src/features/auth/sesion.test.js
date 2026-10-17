import { describe, expect, it } from 'vitest'

import { borrarToken, guardarToken, leerToken } from './sesion'

describe('sesion', () => {
  it('guarda el token de acceso solo en memoria', () => {
    guardarToken('abc')
    expect(leerToken()).toBe('abc')
    expect(localStorage.getItem('icota.token')).toBeNull()
    expect(localStorage.length).toBe(0)

    borrarToken()
    expect(leerToken()).toBeNull()
  })
})
