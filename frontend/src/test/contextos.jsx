import { vi } from 'vitest'

import { ContextoSesion } from '../features/auth/useSesion'
import { ContextoPredio } from '../features/predios/usePredio'
import { PREDIO } from './datos'

// Sesión y predio actual simulados para las pruebas de componentes.
export function ConContextos({
  usuario,
  predio = PREDIO,
  predios = [predio],
  seleccionar = vi.fn(),
  recargar = vi.fn(),
  salir = vi.fn(),
  children,
}) {
  return (
    <ContextoSesion.Provider value={{ usuario, salir }}>
      <ContextoPredio.Provider
        value={{ predios, predio, seleccionar, recargar, cargando: false, error: null }}
      >
        {children}
      </ContextoPredio.Provider>
    </ContextoSesion.Provider>
  )
}
