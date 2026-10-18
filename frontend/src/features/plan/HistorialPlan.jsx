import { fechaHora } from '../../utils/fechas'
import { describirCambio, filaDe } from './catalogo'

// Lista de cambios. Con `conActividad` antepone la actividad (historial del predio).
export default function HistorialPlan({ cambios, conActividad = false }) {
  if (cambios.length === 0) return <p className="formulario__nota">Sin cambios registrados.</p>
  return (
    <ul className="historial-plan">
      {cambios.map((c) => (
        <li key={c.id}>
          <p>
            {conActividad && (
              <strong>
                {c.tipo === 'visita_monitoreo'
                  ? `${filaDe(c).titulo}: `
                  : `${filaDe(c).titulo} · ${c.lote_codigo}: `}
              </strong>
            )}
            {describirCambio(c)}
          </p>
          {c.motivo && <p className="historial-plan__motivo">«{c.motivo}»</p>}
          <p className="historial-plan__autor">
            {c.usuario} · {fechaHora(c.created_at)}
          </p>
        </li>
      ))}
    </ul>
  )
}
