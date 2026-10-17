// Entrega al navegador un archivo recibido de la API (Blob) con el nombre dado.
export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre })
  enlace.click()
  URL.revokeObjectURL(url)
}
