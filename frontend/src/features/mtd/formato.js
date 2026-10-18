// El MTD se guarda sin redondear y se presenta con 4 decimales (skill /revisar-mtd).
export const formatoMtd = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

const formatoDias = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

export const textoMtd = (fila) => (fila.mtd === null ? 'sin dato' : formatoMtd.format(fila.mtd))

// «6 ÷ (2 × 7) = 0,4286» o «sin dato (T × D = 0)».
export function formula(fila) {
  if (fila.mtd === null) return 'sin dato (T × D = 0)'
  return `${fila.moscas} ÷ (${fila.trampas} × ${formatoDias.format(fila.dias_promedio)}) = ${formatoMtd.format(fila.mtd)}`
}

export const ESPECIES = {
  capitata: { nombre: 'Ceratitis capitata', trampas: 'trampas Jackson' },
  anastrepha: { nombre: 'Anastrepha spp.', trampas: 'trampas McPhail' },
}
