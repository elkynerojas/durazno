// Tokens de sesión (acceso y renovación) en localStorage. El acceso puede fallar (modo privado
// o almacenamiento bloqueado); en ese caso la sesión solo dura mientras la pestaña esté abierta.
const CLAVE_ACCESO = 'icota.token'
const CLAVE_RENOVACION = 'icota.renovacion'
const enMemoria = {}

function leer(clave) {
  try {
    return localStorage.getItem(clave) ?? enMemoria[clave] ?? null
  } catch {
    return enMemoria[clave] ?? null
  }
}

function guardar(clave, valor) {
  enMemoria[clave] = valor
  try {
    localStorage.setItem(clave, valor)
  } catch {
    // Se conserva en memoria.
  }
}

function borrar(clave) {
  delete enMemoria[clave]
  try {
    localStorage.removeItem(clave)
  } catch {
    // Nada que borrar.
  }
}

export const leerToken = () => leer(CLAVE_ACCESO)
export const leerTokenRenovacion = () => leer(CLAVE_RENOVACION)

export function guardarToken(acceso, renovacion) {
  guardar(CLAVE_ACCESO, acceso)
  if (renovacion) guardar(CLAVE_RENOVACION, renovacion)
}

export function borrarToken() {
  borrar(CLAVE_ACCESO)
  borrar(CLAVE_RENOVACION)
}
