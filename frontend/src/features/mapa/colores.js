// Colores por defecto de las capas del mapa, de alto contraste sobre la imagen satelital. Cada
// predio (límite) y cada lote pueden guardar el suyo; `null` usa estos.
export const COLOR_LIMITE = '#ffd60a'
export const COLOR_LOTE = '#4ade80'

export const estiloLimite = (color) => ({
  color: color ?? COLOR_LIMITE,
  weight: 3,
  dashArray: '10 6',
  fill: false,
  interactive: false,
})

export const estiloLote = (color, seleccionado = false) => ({
  color: color ?? COLOR_LOTE,
  fillColor: color ?? COLOR_LOTE,
  ...(seleccionado
    ? { weight: 4, dashArray: '6 4', fillOpacity: 0.45 }
    : { weight: 2, fillOpacity: 0.25 }),
})
