import { borrarToken, guardarToken, leerToken } from '../features/auth/sesion'

// Cliente HTTP único para la API. Todas las rutas son relativas a /api/v1;
// en desarrollo Vite las redirige al contenedor de la API (ver vite.config.js).
const BASE = '/api/v1'

// Se emite cuando la API rechaza el token (sesión expirada o usuario desactivado).
export const EVENTO_SESION_CERRADA = 'icota:sesion-cerrada'

export class ErrorApi extends Error {
  constructor(estado, detalle) {
    super(typeof detalle === 'string' ? detalle : `Error ${estado} en la API`)
    this.estado = estado
    this.detalle = detalle
  }
}

// Una sola renovación en curso, compartida por las peticiones que reciban 401 a la vez.
let renovacionEnCurso = null

// El token de renovación viaja en una cookie HttpOnly (mismo sitio): no se lee ni se envía a mano.
function renovarTokens() {
  renovacionEnCurso ??= (async () => {
    const respuesta = await fetch(`${BASE}/auth/renovar`, {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => null)
    if (!respuesta?.ok) return false
    const { access_token } = await respuesta.json()
    guardarToken(access_token)
    return true
  })().finally(() => {
    renovacionEnCurso = null
  })
  return renovacionEnCurso
}

// Al abrir o recargar la página: recupera la sesión con la cookie, si existe.
export const restaurarSesion = () => renovarTokens()

// Borra la cookie de renovación en el servidor.
export const cerrarSesion = () =>
  fetch(`${BASE}/auth/salir`, { method: 'POST', credentials: 'same-origin' }).catch(() => null)

export async function api(
  ruta,
  { metodo = 'GET', cuerpo, reintento = true, binario = false, ...opciones } = {},
) {
  const token = leerToken()
  const esFormulario = cuerpo instanceof URLSearchParams
  const headers = {}
  if (cuerpo && !esFormulario) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers,
    body: cuerpo && !esFormulario ? JSON.stringify(cuerpo) : cuerpo,
    ...opciones,
  })
  if (!respuesta.ok) {
    if (respuesta.status === 401 && token) {
      if (reintento && (await renovarTokens())) {
        return api(ruta, { metodo, cuerpo, reintento: false, binario, ...opciones })
      }
      borrarToken()
      window.dispatchEvent(new Event(EVENTO_SESION_CERRADA))
    }
    const datos = await respuesta.json().catch(() => null)
    throw new ErrorApi(respuesta.status, datos?.detail)
  }
  if (binario) return respuesta.blob()
  return respuesta.status === 204 ? null : await respuesta.json().catch(() => null)
}

export const obtenerSalud = () => api('/health')

// La API usa el flujo OAuth2 "password": correo (en `username`) y clave van como formulario.
export const iniciarSesion = (correo, clave) =>
  api('/auth/token', {
    metodo: 'POST',
    reintento: false,
    cuerpo: new URLSearchParams({ username: correo, password: clave }),
  })

export const obtenerUsuarioActual = () => api('/auth/yo')

export const listarUsuarios = () => api('/usuarios')

export const crearUsuario = (datos) => api('/usuarios', { metodo: 'POST', cuerpo: datos })

export const actualizarUsuario = (id, cambios) =>
  api(`/usuarios/${id}`, { metodo: 'PATCH', cuerpo: cambios })

export const listarPredios = () => api('/predios')

export const crearPredio = (datos) => api('/predios', { metodo: 'POST', cuerpo: datos })

export const actualizarPredio = (id, datos) =>
  api(`/predios/${id}`, { metodo: 'PUT', cuerpo: datos })

export const eliminarPredio = (id) => api(`/predios/${id}`, { metodo: 'DELETE' })

export const listarPersonal = (predioId) => api(`/predios/${predioId}/usuarios`)

export const asignarUsuario = (predioId, usuarioId) =>
  api(`/predios/${predioId}/usuarios/${usuarioId}`, { metodo: 'PUT' })

export const quitarUsuario = (predioId, usuarioId) =>
  api(`/predios/${predioId}/usuarios/${usuarioId}`, { metodo: 'DELETE' })

export const listarLotes = (predioId) => api(`/lotes?predio_id=${predioId}`)

export const crearLote = (datos) => api('/lotes', { metodo: 'POST', cuerpo: datos })

export const actualizarLote = (id, cambios) =>
  api(`/lotes/${id}`, { metodo: 'PATCH', cuerpo: cambios })

export const eliminarLote = (id) => api(`/lotes/${id}`, { metodo: 'DELETE' })

export const listarTrampas = (predioId) => api(`/trampas?predio_id=${predioId}`)

export const listarRutasPredio = (predioId) => api(`/rutas?predio_id=${predioId}`)

// Orden propuesto por vecino más cercano (no se guarda).
export const proponerRuta = (loteId) => api(`/rutas/propuesta?lote_id=${loteId}`)

export const crearRuta = (datos) => api('/rutas', { metodo: 'POST', cuerpo: datos })

export const actualizarRuta = (id, trampas) =>
  api(`/rutas/${id}`, { metodo: 'PUT', cuerpo: { trampas } })

export const obtenerPlan = (predioId, anio) => api(`/plan?predio_id=${predioId}&anio=${anio}`)

// Actividades de la semana ISO de las que el usuario es responsable, en todos sus predios.
export const misActividades = (anio, semana) => api(`/plan/mias?anio=${anio}&semana=${semana}`)

// Programa una actividad (o su serie, con `repetir`); devuelve las actividades creadas.
export const programarActividad = (datos) => api('/plan', { metodo: 'POST', cuerpo: datos })

export const actualizarActividad = (id, cambios) =>
  api(`/plan/${id}`, { metodo: 'PATCH', cuerpo: cambios })

export const eliminarActividad = (id, serie = false) =>
  api(`/plan/${id}${serie ? '?serie=true' : ''}`, { metodo: 'DELETE' })

// Lotes y trampas del predio (FeatureCollection) con el estado de monitoreo de cada trampa.
export const obtenerMapa = (predioId) => api(`/mapa?predio_id=${predioId}`)

export const crearTrampa = (datos) => api('/trampas', { metodo: 'POST', cuerpo: datos })

export const actualizarTrampa = (id, cambios) =>
  api(`/trampas/${id}`, { metodo: 'PATCH', cuerpo: cambios })

export const obtenerQrTrampa = (id, formato) =>
  api(`/trampas/${id}/qr.${formato}`, { binario: true })

export const resolverQr = (codigo) => api(`/trampas/qr/${encodeURIComponent(codigo)}`)

export const obtenerEtiquetasLote = (loteId) =>
  api(`/lotes/${loteId}/etiquetas.pdf`, { binario: true })

// Del predio completo o, con `loteId`, de un solo lote.
export const exportarPredio = (formato, { predioId, loteId }) =>
  api(
    `/export/${formato}?${loteId ? `lote_id=${encodeURIComponent(loteId)}` : `predio_id=${encodeURIComponent(predioId)}`}`,
    { binario: true },
  )

export const obtenerEtiquetaTrampa = (id) => api(`/trampas/${id}/etiqueta.pdf`, { binario: true })

export const reemplazarQr = (id, datos) =>
  api(`/trampas/${id}/qr/reemplazar`, { metodo: 'POST', cuerpo: datos })

export const listarReemplazosQr = (id) => api(`/trampas/${id}/qr/reemplazos`)
