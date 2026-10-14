import { borrarToken, leerToken } from '../features/auth/sesion'

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

export async function api(ruta, { metodo = 'GET', cuerpo, ...opciones } = {}) {
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
  const datos = respuesta.status === 204 ? null : await respuesta.json().catch(() => null)
  if (!respuesta.ok) {
    if (respuesta.status === 401 && token) {
      borrarToken()
      window.dispatchEvent(new Event(EVENTO_SESION_CERRADA))
    }
    throw new ErrorApi(respuesta.status, datos?.detail)
  }
  return datos
}

export const obtenerSalud = () => api('/health')

// La API usa el flujo OAuth2 "password": usuario y clave van como formulario.
export const iniciarSesion = (usuario, clave) =>
  api('/auth/login', {
    metodo: 'POST',
    cuerpo: new URLSearchParams({ username: usuario, password: clave }),
  })

export const obtenerUsuarioActual = () => api('/auth/yo')
