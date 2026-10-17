import { Link } from 'react-router'

// Migas, título y acciones de la página. `migas`: [{ texto, a? }] sin incluir el título.
export default function Encabezado({ migas = [], titulo, children }) {
  return (
    <header className="encabezado">
      <div>
        {migas.length > 0 && (
          <p className="migas">
            {migas.map((miga, i) => (
              <span key={miga.texto}>
                {i > 0 && ' / '}
                {miga.a ? <Link to={miga.a}>{miga.texto}</Link> : miga.texto}
              </span>
            ))}
          </p>
        )}
        <h1>{titulo}</h1>
      </div>
      {children && <div className="grupo-botones">{children}</div>}
    </header>
  )
}
