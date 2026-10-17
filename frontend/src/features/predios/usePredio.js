import { createContext, useContext } from 'react'

export const ContextoPredio = createContext(null)

// Predios que el usuario puede ver y el predio con el que está trabajando.
export const usePredio = () => useContext(ContextoPredio)
