import { useState } from 'react'

import { eliminarPredio } from '../../api/client'
import Encabezado from '../../components/Encabezado'
import Plantilla from '../../components/Plantilla'
import { formatoHa } from '../../utils/formato'
import FormularioPredio from './FormularioPredio'
import PersonalPredio from './PersonalPredio'
import { usePredio } from './usePredio'

// Administración de predios (solo administrador): crear, editar, eliminar y asignar personal.
export default function VistaPredios() {
  const { predios, recargar, seleccionar } = usePredio()
  // null | { modo: 'nuevo' } | { modo: 'editar' | 'personal', predio }
  const [panel, setPanel] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [error, setError] = useState(null)

  async function eliminar(predio) {
    setError(null)
    try {
      await eliminarPredio(predio.id)
      setConfirmar(null)
      setPanel(null)
      await recargar()
    } catch (e) {
      setError(e.estado === 409 ? e.message : 'No se pudo eliminar el predio.')
    }
  }

  return (
    <Plantilla>
      <Encabezado migas={[{ texto: 'Administración' }]} titulo="Predios">
        <button
          type="button"
          className="boton-primario"
          onClick={() => setPanel({ modo: 'nuevo' })}
        >
          + Nuevo predio
        </button>
      </Encabezado>
      {error && (
        <p className="formulario__error" role="alert">
          {error}
        </p>
      )}

      <div className="rejilla rejilla--mapa">
        <section className="tarjeta tarjeta--sin-relleno" aria-label="Predios registrados">
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
                  <tr key={p.id}>
                    <td>
                      <strong>{p.nombre}</strong>
                    </td>
                    <td className="tabla__secundaria">{p.vereda}</td>
                    <td className="tabla__secundaria">{p.municipio}</td>
                    <td className="tabla__secundaria mono">{p.registro_ica ?? '—'}</td>
                    <td className="tabla__secundaria">{formatoHa.format(p.area_ha)} ha</td>
                    <td>
                      <div className="grupo-botones">
                        <button
                          type="button"
                          className="enlace"
                          onClick={() => setPanel({ modo: 'editar', predio: p })}
                          aria-label={`Editar ${p.nombre}`}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="enlace"
                          onClick={() => setPanel({ modo: 'personal', predio: p })}
                          aria-label={`Personal de ${p.nombre}`}
                        >
                          Personal
                        </button>
                        {confirmar === p.id ? (
                          <button
                            type="button"
                            className="boton-peligro"
                            onClick={() => eliminar(p)}
                          >
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
            {predios?.length === 0 && (
              <p className="tabla__vacia">Aún no hay predios. Cree el primero.</p>
            )}
          </div>
        </section>

        <section className="tarjeta">
          {!panel && (
            <p className="formulario__nota">
              Elija un predio para editar sus datos o asignar su personal, o cree uno nuevo.
            </p>
          )}
          {panel?.modo === 'nuevo' && (
            <FormularioPredio
              editable
              alGuardar={async (creado) => {
                await recargar()
                seleccionar(creado.id)
                setPanel({ modo: 'personal', predio: creado })
              }}
              alCancelar={() => setPanel(null)}
            />
          )}
          {panel?.modo === 'editar' && (
            <FormularioPredio
              key={panel.predio.id}
              predio={panel.predio}
              editable
              alGuardar={recargar}
              alCancelar={() => setPanel(null)}
            />
          )}
          {panel?.modo === 'personal' && (
            <PersonalPredio key={panel.predio.id} predio={panel.predio} />
          )}
        </section>
      </div>
    </Plantilla>
  )
}
