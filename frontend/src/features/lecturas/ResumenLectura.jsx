import { fechaHora } from '../../utils/fechas'

// Datos básicos de una lectura (la última de la trampa, o la recién registrada).
export default function ResumenLectura({ lectura }) {
  const capitata = lectura.capitata_machos + lectura.capitata_hembras
  return (
    <dl className="ficha__datos">
      <dt>Fecha</dt>
      <dd>{fechaHora(lectura.observado_en)}</dd>
      <dt>C. capitata</dt>
      <dd>
        {capitata} ({lectura.capitata_machos} ♂ · {lectura.capitata_hembras} ♀)
      </dd>
      <dt>Anastrepha</dt>
      <dd>{lectura.anastrepha}</dd>
      <dt>Exposición</dt>
      <dd>{lectura.dias_exposicion === 1 ? '1 día' : `${lectura.dias_exposicion} días`}</dd>
    </dl>
  )
}
