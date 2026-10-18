// MTD de una sola trampa en una lectura: M / (T × D) con T = 1 (Manual ICA). Es una referencia
// para el técnico; el MTD oficial del predio lo calcula el servidor (HU-28).

// Moscas de la especie que vigila cada tipo de trampa: Jackson → C. capitata (machos y
// hembras); McPhail → Anastrepha.
export function moscasObjetivo(tipo, capturas) {
  return tipo === 'jackson'
    ? capturas.capitata_machos + capturas.capitata_hembras
    : capturas.anastrepha
}

// null si T × D = 0: el MTD no está definido y nunca se divide por cero.
export const mtdTrampa = (moscas, dias) => (dias > 0 ? moscas / (1 * dias) : null)
