import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { respuestaJson, simularFetch } from '../../test/utilidades'
import { obtenerUbicacion } from '../../utils/ubicacion'
import FormularioHallazgo from './FormularioHallazgo'

vi.mock('../../utils/ubicacion', () => ({
  UMBRAL_PRECISION_M: 10,
  obtenerUbicacion: vi.fn(),
}))

const cuadro = (x0, y0, x1, y1) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ],
})
const LOTES = [
  { id: 'l-a', codigo: 'L-A', nombre: null, geom: cuadro(-72.64, 7.27, -72.639, 7.271) },
]
const TIPOS = [{ id: 'tp-1', nombre: 'Plaga', color: '#d35400' }]
const HALLAZGO = { id: 'h-1', titulo: 'Gusano', evidencias: [] }

function ConEstado(props) {
  const [coordenadas, setCoordenadas] = useState({ lat: '', lng: '' })
  const [loteId, setLoteId] = useState('l-a')
  return (
    <FormularioHallazgo
      lotes={LOTES}
      tipos={TIPOS}
      loteId={loteId}
      alCambiarLote={setLoteId}
      coordenadas={coordenadas}
      alCambiarCoordenadas={setCoordenadas}
      alCapturar={vi.fn()}
      alCancelar={vi.fn()}
      {...props}
    />
  )
}

async function llenar(usuario) {
  await usuario.type(screen.getByLabelText('Título'), 'Gusano')
  await usuario.type(screen.getByLabelText('Descripción detallada'), 'Larvas en frutos')
}

beforeEach(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
})

describe('FormularioHallazgo', () => {
  it('registra con el GPS y su precisión y luego sube la foto como multipart', async () => {
    obtenerUbicacion.mockResolvedValue({ lat: 7.2705, lng: -72.6395, precision: 4.257 })
    const fetch = simularFetch(
      respuestaJson(201, HALLAZGO),
      respuestaJson(201, { id: 'e-1' }),
      respuestaJson(200, { ...HALLAZGO, evidencias: [{ id: 'e-1' }] }),
    )
    const usuario = userEvent.setup()
    const alGuardar = vi.fn()
    render(<ConEstado alGuardar={alGuardar} />)

    await llenar(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Usar mi ubicación' }))
    expect(await screen.findByRole('status')).toHaveTextContent('dentro del lote L-A')
    const foto = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    await usuario.upload(screen.getByLabelText('Agregar fotos'), foto)
    expect(screen.getByRole('img', { name: 'Foto 1' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Guardar hallazgo' }))

    await vi.waitFor(() => expect(alGuardar).toHaveBeenCalled())
    const cuerpo = JSON.parse(fetch.mock.calls[0][1].body)
    expect(cuerpo).toMatchObject({
      lote_id: 'l-a',
      tipo_id: 'tp-1',
      titulo: 'Gusano',
      precision_m: 4.26,
      ubicacion: { type: 'Point', coordinates: [-72.6395, 7.2705] },
    })
    expect(cuerpo.id).toMatch(/^[0-9a-f-]{36}$/)
    const [url, opciones] = fetch.mock.calls[1]
    expect(url).toBe('/api/v1/inspecciones/hallazgos/h-1/evidencias')
    expect(opciones.body).toBeInstanceOf(FormData)
    expect(opciones.body.get('archivo').name).toBe('foto.jpg')
    expect(alGuardar).toHaveBeenCalledWith({ ...HALLAZGO, evidencias: [{ id: 'e-1' }] })
  })

  it('sin GPS no envía precisión y rechaza archivos que no son fotos', async () => {
    const fetch = simularFetch(respuestaJson(201, HALLAZGO), respuestaJson(200, HALLAZGO))
    const usuario = userEvent.setup({ applyAccept: false })
    render(<ConEstado alGuardar={vi.fn()} />)

    await llenar(usuario)
    await usuario.type(screen.getByLabelText('Latitud'), '7.2705')
    await usuario.type(screen.getByLabelText('Longitud'), '-72.6395')
    await usuario.upload(
      screen.getByLabelText('Agregar fotos'),
      new File(['%PDF'], 'informe.pdf', { type: 'application/pdf' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Solo se aceptan fotos')
    await usuario.click(screen.getByRole('button', { name: 'Guardar hallazgo' }))

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('precision_m')
  })

  it('si una foto falla, deja el hallazgo registrado y permite reintentar sin duplicar', async () => {
    const fetch = simularFetch(
      respuestaJson(201, HALLAZGO),
      respuestaJson(413, { detail: 'La foto supera los 8 MB.' }),
    )
    const usuario = userEvent.setup()
    const alGuardar = vi.fn()
    render(<ConEstado alGuardar={alGuardar} />)

    await llenar(usuario)
    await usuario.type(screen.getByLabelText('Latitud'), '7.2705')
    await usuario.type(screen.getByLabelText('Longitud'), '-72.6395')
    await usuario.upload(
      screen.getByLabelText('Agregar fotos'),
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
    )
    await usuario.click(screen.getByRole('button', { name: 'Guardar hallazgo' }))

    expect(await screen.findByText(/quedó registrado, pero 1 foto no se subió/)).toBeInTheDocument()
    expect(alGuardar).not.toHaveBeenCalled()

    fetch.mockResolvedValueOnce(respuestaJson(200, HALLAZGO))
    fetch.mockResolvedValueOnce(respuestaJson(201, { id: 'e-1' }))
    fetch.mockResolvedValueOnce(respuestaJson(200, HALLAZGO))
    await usuario.click(screen.getByRole('button', { name: 'Guardar hallazgo' }))
    await vi.waitFor(() => expect(alGuardar).toHaveBeenCalled())
    const ids = [0, 2].map((i) => JSON.parse(fetch.mock.calls[i][1].body).id)
    expect(ids[0]).toBe(ids[1])
    expect(fetch.mock.calls[1][1].body.get('id')).toBe(fetch.mock.calls[3][1].body.get('id'))
  })

  it('avisa cuando el punto no cae en el lote elegido', async () => {
    const usuario = userEvent.setup()
    render(<ConEstado alGuardar={vi.fn()} />)
    await usuario.type(screen.getByLabelText('Latitud'), '7.5')
    await usuario.type(screen.getByLabelText('Longitud'), '-72.6')
    expect(screen.getByRole('status')).toHaveTextContent('El punto no cae dentro de L-A')
  })
})
