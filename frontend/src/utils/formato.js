// Números presentados con el formato colombiano (coma decimal).
export const formatoHa = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Coordenada decimal con 5 cifras (~1 m), como en el mockup.
export const formatoCoordenada = (valor) => valor.toFixed(5)
