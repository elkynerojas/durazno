import { useCallback, useEffect, useRef, useState } from 'react'

import { listarLotes } from '../../api/client'
import BarraSuperior from '../../components/BarraSuperior'
import MapaPredio from '../../components/MapaPredio'
import { leafletAGeojson } from '../../utils/geo'
import { useSesion } from '../auth/useSesion'
import CapaLotes from '../lotes/CapaLotes'
import ControlDibujo from '../lotes/ControlDibujo'
import PanelLote from '../lotes/PanelLote'

const porCodigo = (a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })

export default function VistaMapa() {
  const { usuario } = useSesion()
  const editable = usuario.rol === 'agronomo'
  const [lotes, setLotes] = useState([])
  const [error, setError] = useState(null)
  // null | { geomNueva } (recién dibujado) | { lote, advertencias } (lote existente).
  const [seleccion, setSeleccion] = useState(null)
  const [editandoForma, setEditandoForma] = useState(false)
  // Sube al cancelar una edición de forma para volver a pintar los polígonos guardados.
  const [version, setVersion] = useState(0)
  const refCapas = useRef(new Map())

  useEffect(() => {
    listarLotes()
      .then((lista) => setLotes(lista.sort(porCodigo)))
      .catch(() => setError('No se pudieron cargar los lotes.'))
  }, [])

  const cerrar = () => {
    setSeleccion(null)
    setEditandoForma(false)
  }

  const alDibujar = useCallback((anillos) => {
    setEditandoForma(false)
    setSeleccion({ geomNueva: leafletAGeojson(anillos) })
  }, [])

  function alGuardar({ advertencias, ...lote }) {
    setLotes((lista) => [...lista.filter((l) => l.id !== lote.id), lote].sort(porCodigo))
    setEditandoForma(false)
    setSeleccion({ lote, advertencias })
  }

  function alEliminar(id) {
    setLotes((lista) => lista.filter((l) => l.id !== id))
    cerrar()
  }

  const loteSeleccionado = seleccion?.lote
  const obtenerForma = () =>
    leafletAGeojson(refCapas.current.get(loteSeleccionado.id).getLatLngs())

  return (
    <div className="app">
      <BarraSuperior />
      <main className="contenido contenido--mapa">
        {error && (
          <p className="formulario__error mapa__error" role="alert">
            {error}
          </p>
        )}
        <MapaPredio>
          <CapaLotes
            lotes={lotes}
            seleccionadoId={loteSeleccionado?.id}
            editandoId={editandoForma ? loteSeleccionado?.id : null}
            alSeleccionar={(lote) => {
              if (editandoForma) return
              setSeleccion({ lote, advertencias: [] })
            }}
            refCapas={refCapas}
            version={version}
          />
          {editable && <ControlDibujo alDibujar={alDibujar} />}
        </MapaPredio>
        {seleccion && (
          <PanelLote
            key={loteSeleccionado?.id ?? 'nuevo'}
            lote={loteSeleccionado}
            geomNueva={seleccion.geomNueva}
            advertencias={seleccion.advertencias}
            editable={editable}
            editandoForma={editandoForma}
            obtenerForma={obtenerForma}
            alEditarForma={() => setEditandoForma(true)}
            alGuardar={alGuardar}
            alEliminar={alEliminar}
            alCerrar={() => {
              if (editandoForma) setVersion((v) => v + 1)
              cerrar()
            }}
          />
        )}
      </main>
    </div>
  )
}
