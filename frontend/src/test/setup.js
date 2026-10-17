import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { borrarToken } from '../features/auth/sesion'

afterEach(() => {
  cleanup()
  borrarToken()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
