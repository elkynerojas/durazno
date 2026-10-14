import { createContext, useContext } from 'react'

export const ContextoSesion = createContext(null)

export function useSesion() {
  return useContext(ContextoSesion)
}
