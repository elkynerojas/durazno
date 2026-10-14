// Token de sesión en localStorage. El acceso puede fallar (modo privado o
// almacenamiento bloqueado); en ese caso la sesión solo dura mientras la pestaña esté abierta.
const CLAVE = 'icota.token'
let tokenEnMemoria = null

export function leerToken() {
  try {
    return localStorage.getItem(CLAVE) ?? tokenEnMemoria
  } catch {
    return tokenEnMemoria
  }
}

export function guardarToken(token) {
  tokenEnMemoria = token
  try {
    localStorage.setItem(CLAVE, token)
  } catch {
    // Se conserva en memoria.
  }
}

export function borrarToken() {
  tokenEnMemoria = null
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // Nada que borrar.
  }
}
