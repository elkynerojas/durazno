import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { resolverQr } from '../../api/client'
import Encabezado from '../../components/Encabezado'
import Plantilla from '../../components/Plantilla'
import { usePredio } from '../predios/usePredio'
import { TIPOS_TRAMPA } from '../trampas/catalogo'
import FormularioLectura from './FormularioLectura'
import ResumenLectura from './ResumenLectura'

// Lectura de una trampa (HU-25): /t/<código QR>/lectura, desde la ficha del QR o desde el mapa.
export default function VistaLectura() {
  const { codigo } = useParams()
  const { predio, seleccionar } = usePredio()
  const [estado, setEstado] = useState({ cargando: true })
  const [registrada, setRegistrada] = useState(null)

  useEffect(() => {
    let vigente = true
    resolverQr(codigo)
      .then((datos) => vigente && setEstado({ datos }))
      .catch(
        (e) =>
          vigente &&
          setEstado({
            error: [404, 410].includes(e.estado) ? e.message : 'No se pudo abrir la trampa.',
          }),
      )
    return () => {
      vigente = false
    }
  }, [codigo])

  // Como en la ficha: la trampa de otro predio asignado pasa a ser el predio actual.
  const predioTrampa = estado.datos?.lote.predio_id
  useEffect(() => {
    if (predioTrampa && predioTrampa !== predio?.id) seleccionar(predioTrampa)
  }, [predioTrampa, predio?.id, seleccionar])

  if (!estado.datos) {
    return (
      <Plantilla>
        {estado.cargando && <p className="cargando">Abriendo la trampa…</p>}
        {estado.error && (
          <p className="formulario__error" role="alert">
            {estado.error}
          </p>
        )}
      </Plantilla>
    )
  }

  const { trampa, lote, ruta, ultima_lectura } = estado.datos
  const tipo = TIPOS_TRAMPA[trampa.tipo]
  const migas = [
    { texto: `Lote ${lote.codigo}`, a: `/lotes?lote=${lote.id}` },
    ...(ruta
      ? [{ texto: `Parada ${ruta.orden} de ${ruta.total}`, a: `/rutas?lote=${lote.id}` }]
      : []),
    { texto: trampa.codigo_ica, a: `/t/${trampa.codigo_qr}` },
  ]

  return (
    <Plantilla>
      <Encabezado migas={migas} titulo="Lectura de trampa" />
      <div className="rejilla rejilla--mapa">
        <section className="tarjeta">
          {registrada ? (
            <div role="status">
              <p className="formulario__exito">Lectura de {trampa.codigo_ica} registrada.</p>
              <ResumenLectura lectura={registrada} />
              {registrada.distancia_m !== null && (
                <p className="formulario__nota">
                  Tomada a {Math.round(registrada.distancia_m)} m de la trampa.
                </p>
              )}
              <div className="grupo-botones">
                <Link to="/lecturas?registrar=1" className="boton-primario">
                  Registrar otra
                </Link>
                <Link to="/mi-semana" className="boton-secundario">
                  Mi semana
                </Link>
                {ruta && (
                  <Link to={`/rutas?lote=${lote.id}`} className="boton-secundario">
                    Ruta del lote
                  </Link>
                )}
                <Link to={`/t/${trampa.codigo_qr}`} className="boton-secundario">
                  Ficha de la trampa
                </Link>
              </div>
            </div>
          ) : trampa.estado !== 'activa' ? (
            <p className="formulario__aviso" role="alert">
              La trampa {trampa.codigo_ica} está {trampa.estado}: no admite lecturas.
            </p>
          ) : (
            <FormularioLectura trampa={trampa} alGuardar={setRegistrada} />
          )}
        </section>

        <div className="columna">
          <section className="tarjeta" aria-label="Ficha de la trampa">
            <p className="ficha__antetitulo">Ficha de la trampa</p>
            <p className="ficha__titulo">{trampa.codigo_ica}</p>
            <p className="ficha__subtitulo">
              {tipo.nombre} + {trampa.atrayente.toLowerCase()} · Lote {lote.codigo}
              {lote.nombre ? ` · ${lote.nombre}` : ''}
            </p>
          </section>
          <section className="tarjeta" aria-labelledby="titulo-anterior">
            <h2 id="titulo-anterior" className="tarjeta__titulo">
              Lectura anterior
            </h2>
            {ultima_lectura ? (
              <ResumenLectura lectura={ultima_lectura} />
            ) : (
              <p className="formulario__nota">Es la primera lectura de esta trampa.</p>
            )}
          </section>
          {ruta && (
            <section className="tarjeta" aria-labelledby="titulo-siguiente">
              <h2 id="titulo-siguiente" className="tarjeta__titulo">
                Siguiente en la ruta
              </h2>
              <p>
                {ruta.siguiente
                  ? `${ruta.siguiente} · parada ${ruta.orden + 1} de ${ruta.total}`
                  : `Ruta del lote ${lote.codigo} completa · ${ruta.total} de ${ruta.total}`}
              </p>
            </section>
          )}
        </div>
      </div>
    </Plantilla>
  )
}
