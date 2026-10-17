import { fechaCorta } from '../../utils/fechas'
import { formatoCoordenada } from '../../utils/formato'
import { puntoALeaflet } from '../../utils/geo'
import { ESTADOS_TRAMPA, TIPOS_TRAMPA } from './catalogo'

// Trampas de un lote (o de todo el predio) con su QR y estado.
export default function TablaTrampas({ titulo, trampas, seleccionadaId, alSeleccionar, editable }) {
  return (
    <section className="tarjeta tarjeta--sin-relleno" aria-labelledby="titulo-trampas">
      <div className="tarjeta__cabecera">
        <h2 id="titulo-trampas" className="tarjeta__titulo">
          {titulo}
        </h2>
      </div>
      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Código ICA</th>
              <th className="tabla__secundaria">Tipo</th>
              <th className="tabla__secundaria">Coordenadas (WGS 84)</th>
              <th className="tabla__secundaria">Instalada</th>
              <th className="tabla__secundaria">QR</th>
              <th>Estado</th>
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {trampas.map((trampa) => {
              const [lat, lng] = puntoALeaflet(trampa.geom)
              const tipo = TIPOS_TRAMPA[trampa.tipo]
              return (
                <tr
                  key={trampa.id}
                  className={trampa.id === seleccionadaId ? 'tabla__seleccionada' : undefined}
                >
                  <td className="mono">{trampa.codigo_ica}</td>
                  <td className="tabla__secundaria">
                    {tipo.nombre} + {trampa.atrayente.toLowerCase()}
                  </td>
                  <td className="mono tabla__secundaria">
                    {formatoCoordenada(lat)}, {formatoCoordenada(lng)}
                  </td>
                  <td className="tabla__secundaria">{fechaCorta(trampa.fecha_instalacion)}</td>
                  <td className="mono tabla__secundaria">{trampa.codigo_qr}</td>
                  <td>
                    <span className={`insignia insignia--${trampa.estado}`}>
                      {ESTADOS_TRAMPA[trampa.estado]}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="enlace"
                      onClick={() => alSeleccionar(trampa)}
                      aria-label={`Ver ficha de ${trampa.codigo_ica}`}
                    >
                      {editable ? 'Editar' : 'Ver ficha'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {trampas.length === 0 && <p className="tabla__vacia">Aún no hay trampas registradas.</p>}
      </div>
    </section>
  )
}
