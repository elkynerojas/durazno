import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'

import { TIPOS_TRAMPA } from '../trampas/catalogo'
import { mover } from './orden'

const metros = (m) => `${Math.round(m)} m`

// «Orden de visita»: arrastrando la manija (también con el dedo) o con las flechas.
export default function ListaParadas({ paradas, editable, alCambiar }) {
  const reordenar = (desde, hasta) =>
    alCambiar(
      mover(
        paradas.map((p) => p.trampa.id),
        desde,
        hasta,
      ),
    )

  return (
    <DragDropProvider
      onDragEnd={(evento) => {
        if (evento.canceled) return
        const { source } = evento.operation
        if (isSortable(source) && source.initialIndex !== source.index) {
          reordenar(source.initialIndex, source.index)
        }
      }}
    >
      <ol className="lista-paradas" aria-label="Orden de visita">
        {paradas.map((parada, i) => (
          <Parada
            key={parada.trampa.id}
            parada={parada}
            indice={i}
            ultima={i === paradas.length - 1}
            editable={editable}
            alMover={(hasta) => reordenar(i, hasta)}
          />
        ))}
      </ol>
    </DragDropProvider>
  )
}

function Parada({ parada, indice, ultima, editable, alMover }) {
  const { ref, handleRef, isDragging } = useSortable({
    id: parada.trampa.id,
    index: indice,
    disabled: !editable,
  })
  const { trampa, distancia } = parada
  return (
    <li ref={ref} className="parada" data-arrastrando={isDragging || undefined}>
      {editable && (
        <span
          ref={handleRef}
          className="parada__manija"
          aria-hidden="true"
          title="Arrastre para reordenar"
        >
          ⠿
        </span>
      )}
      <span className="parada__numero">{indice + 1}</span>
      <span className="parada__datos">
        <span className="mono parada__codigo">{trampa.codigo_ica}</span>
        <span className="parada__detalle">
          {TIPOS_TRAMPA[trampa.tipo].nombre}
          {distancia != null && ` · ${metros(distancia)}`}
        </span>
      </span>
      {editable && (
        <span className="parada__flechas">
          <button
            type="button"
            className="boton-secundario"
            aria-label={`Subir ${trampa.codigo_ica}`}
            disabled={indice === 0}
            onClick={() => alMover(indice - 1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="boton-secundario"
            aria-label={`Bajar ${trampa.codigo_ica}`}
            disabled={ultima}
            onClick={() => alMover(indice + 1)}
          >
            ↓
          </button>
        </span>
      )}
    </li>
  )
}
