// Con espacio que no se corta, para que el «%» no quede solo en otra línea.
const porcentaje = (valor) => (valor === null ? '—' : `${String(valor).replace('.', ',')}\u00a0%`)

// Indicadores de cumplimiento del plan (HU-22): total, por lote y últimas semanas.
export default function TarjetaCumplimiento({ cumplimiento }) {
  const { total, lotes, semanas, hasta_semana: hasta } = cumplimiento
  return (
    <section className="tarjeta" aria-labelledby="titulo-cumplimiento">
      <h2 id="titulo-cumplimiento" className="tarjeta__titulo">
        Cumplimiento {hasta > 0 ? `S1–S${hasta}` : ''}
      </h2>
      {total.programadas === 0 ? (
        <p className="formulario__nota">Aún no hay actividades que debieran estar hechas.</p>
      ) : (
        <>
          <div className="cumplimiento__total">
            <div>
              <p className="cumplimiento__cifra">{porcentaje(total.porcentaje)}</p>
              <p className="formulario__nota">
                {total.cumplidas} de {total.programadas} cumplidas
              </p>
            </div>
            <div>
              <p className="cumplimiento__cifra">{total.reprogramadas}</p>
              <p className="formulario__nota">Reprogramadas</p>
            </div>
            <div>
              <p className="cumplimiento__cifra cumplimiento__cifra--vencidas">{total.vencidas}</p>
              <p className="formulario__nota">Vencidas</p>
            </div>
          </div>
          <div className="tabla-contenedor">
            <table className="tabla" aria-label="Cumplimiento por lote">
              <thead>
                <tr>
                  <th scope="col">Lote</th>
                  <th scope="col">Cumplidas</th>
                  <th scope="col">Vencidas</th>
                  <th scope="col">%</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((l) => (
                  <tr key={l.lote_id}>
                    <th scope="row">{l.lote_codigo}</th>
                    <td>
                      {l.cumplidas} de {l.programadas}
                    </td>
                    <td>{l.vencidas}</td>
                    <td>{porcentaje(l.porcentaje)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="formulario__nota">
            Últimas semanas:{' '}
            {semanas
              .slice(-6)
              .map((s) => `S${s.semana} ${porcentaje(s.porcentaje)}`)
              .join(' · ')}
          </p>
        </>
      )}
    </section>
  )
}
