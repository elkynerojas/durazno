// Formulario de lectura (HU-25).
export const ESTADOS_TRAMPA_LECTURA = {
  buena: 'Buena',
  danada: 'Dañada',
  faltante: 'Faltante',
  reubicada: 'Reubicada',
}

// Capturas por especie, en el orden del formulario.
export const CAPTURAS = [
  {
    campo: 'capitata_machos',
    especie: 'Ceratitis capitata',
    detalle: 'machos',
    ayuda: 'Atraídos por trimedlure',
  },
  {
    campo: 'capitata_hembras',
    especie: 'Ceratitis capitata',
    detalle: 'hembras',
    ayuda: 'Revisar con lupa',
  },
  { campo: 'anastrepha', especie: 'Anastrepha', detalle: 'spp.', ayuda: 'Sobre todo en McPhail' },
]
