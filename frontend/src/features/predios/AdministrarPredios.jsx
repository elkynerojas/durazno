import { useState } from 'react'

import { eliminarPredio } from '../../api/client'
import { formatoHa } from '../../utils/formato'
import FormularioPredio from './FormularioPredio'
import { usePredio } from './usePredio'

// Todos los predios (solo administrador): crear, abrir como predio actual y eliminar. Los datos,
// el límite y el personal del predio abierto se editan arriba, en la vista «Predio».
export default function AdministrarPredios() {
  const { predios, predio: actual, recargar, seleccionar } = usePredio()
  const [nuevo, setNuevo] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [error, setError] = useState(null)

  function abrir(id) {
    seleccionar(id)
    // En escritorio el contenido tiene su propio scroll: se sube hasta el título de la página.
    document.querySelector('h1')?.scrollIntoView?.({ behavior: 'smooth' })
  }

  async function eliminar(predio) {
    setError(null)
    try {
      await eliminarPredio(predio.id)
      setConfirmar(null)
      await recargar()
    } catch (e) {
      setError(e.estado === 409 ? e.message : 'No se pudo eliminar el predio.')
    }
  }

  return (
    <section className="tarjeta" aria-labelledby="titulo-predios">
      <div className="ficha__encabezado">
        <h2 id="titulo-predios" className="tarjeta__titulo">
          Todos los predios
        </h2>
        {!nuevo && (
          <button type="button" className="boton-primario" onClick={() => setNuevo(true)}>
            + Nuevo predio
          </button>
        )}
      </div>
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}
      {nuevo && (
        <FormularioPredio
          editable
          alGuardar={async (creado) => {
            await recargar()
            setNuevo(false)
            abrir(creado.id)
          }}
          alCancelar={() => setNuevo(false)}
        />
      )}
      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th className="tabla__secundaria">Vereda</th>
              <th className="tabla__secundaria">Municipio</th>
              <th className="tabla__secundaria">Registro ICA</th>
              <th className="tabla__secundaria">Área</th>
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {predios?.map((p) => (
              <tr key={p.id} aria-current={p.id === actual?.id ? 'true' : undefined}>
                <td>
                  <strong>{p.nombre}</strong>
                  {p.id === actual?.id && <span className="insignia insignia--activa">Actual</span>}
                </td>
                <td className="tabla__secundaria">{p.vereda}</td>
                <td className="tabla__secundaria">{p.municipio}</td>
                <td className="tabla__secundaria mono">{p.registro_ica ?? '—'}</td>
                <td className="tabla__secundaria">{formatoHa.format(p.area_ha)} ha</td>
                <td>
                  <div className="grupo-botones">
                    {p.id !== actual?.id && (
                      <button
                        type="button"
                        className="enlace"
                        onClick={() => abrir(p.id)}
                        aria-label={`Abrir ${p.nombre}`}
                      >
                        Abrir
                      </button>
                    )}
                    {confirmar === p.id ? (
                      <button type="button" className="boton-peligro" onClick={() => eliminar(p)}>
                        Confirmar: eliminar {p.nombre}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="enlace"
                        onClick={() => setConfirmar(p.id)}
                        aria-label={`Eliminar ${p.nombre}`}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {predios?.length === 0 && !nuevo && (
          <p className="tabla__vacia">Aún no hay predios. Cree el primero.</p>
        )}
      </div>
    </section>
  )
}
