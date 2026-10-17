import { expect, test } from '@playwright/test'

const CORREO = process.env.E2E_CORREO ?? 'e2e-agronomo@example.com'
const CLAVE = process.env.E2E_CLAVE

test('el agrónomo dibuja un lote, ve su área y lo elimina', async ({ page }) => {
  test.skip(!CLAVE, 'Defina E2E_CLAVE y ejecute app.scripts.sembrar_e2e')
  await page.goto('/')
  await page.getByLabel('Correo').fill(CORREO)
  await page.getByLabel('Contraseña').fill(CLAVE)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL('/mapa')

  // Los lotes exigen el predio registrado.
  await page.getByRole('link', { name: 'Predio' }).click()
  const titulo = page.getByRole('heading', { level: 2 })
  await expect(titulo).toBeVisible()
  if ((await titulo.textContent()) === 'Registrar el predio') {
    await page.getByLabel('Nombre').fill('Finca E2E')
    await page.getByLabel('Área (hectáreas)').fill('30')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Datos del predio guardados.')).toBeVisible()
  }

  await page.getByRole('link', { name: 'Mapa' }).click()
  const mapa = page.locator('.leaflet-container')
  await expect(mapa).toBeVisible()
  const caja = await mapa.boundingBox()
  const punto = (fx, fy) => [caja.x + caja.width * fx, caja.y + caja.height * fy]

  await page.locator('.leaflet-pm-icon-polygon').click()
  for (const [fx, fy] of [
    [0.35, 0.3],
    [0.65, 0.3],
    [0.65, 0.6],
    [0.35, 0.6],
    [0.35, 0.3],
  ]) {
    await page.mouse.click(...punto(fx, fy))
  }

  const codigo = `E2E-${Date.now() % 1_000_000}`
  const panel = page.getByRole('complementary', { name: 'Nuevo lote' })
  await expect(panel).toBeVisible()
  await panel.getByLabel('Código').fill(codigo)
  await panel.getByRole('button', { name: 'Guardar' }).click()

  const guardado = page.getByRole('complementary', { name: `Lote ${codigo}` })
  await expect(guardado.getByText(/^Área: [\d.,]+ ha$/)).toBeVisible()
  await expect(page.locator('.etiqueta-lote', { hasText: codigo })).toBeVisible()

  await guardado.getByRole('button', { name: 'Eliminar lote' }).click()
  await guardado.getByRole('button', { name: `Confirmar: eliminar ${codigo}` }).click()
  await expect(page.locator('.etiqueta-lote', { hasText: codigo })).toHaveCount(0)
})
