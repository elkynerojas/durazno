---
name: escribir-pruebas
description: Escribe o completa pruebas automatizadas del proyecto — pytest en el backend, Vitest + Testing Library en el frontend y Playwright E2E para flujos de usuario — siguiendo las convenciones y fixtures existentes. Úsalo al implementar cualquier tarea [API], [Web] o [Pruebas] o cuando falten pruebas.
argument-hint: [archivo, módulo o HU-xx]
---

Escribe las pruebas de **$ARGUMENTS**. Si es una historia, sus criterios de aceptación en
`BACKLOG.md` dicen qué hay que demostrar: una prueba por criterio verificable.

Primero revisa las pruebas y ayudas existentes para no duplicar:
`backend/tests/conftest.py`, `backend/tests/utilidades.py`, `frontend/src/test/` y `frontend/e2e/`.

## Qué tipo de prueba usar
| Qué se prueba | Dónde | Herramienta |
|---|---|---|
| Lógica pura (`services/`: MTD, rutas, QR, semanas ISO) | `backend/tests/test_<modulo>.py` | pytest, sin base |
| Endpoints, validaciones PostGIS, permisos | `backend/tests/test_<grupo>.py` | pytest + fixtures `cliente`, `session`, `crear_usuario` |
| Utilidades, cliente HTTP, componentes y formularios | `frontend/src/**/<Archivo>.test.{js,jsx}` junto al archivo | Vitest + Testing Library |
| Flujo completo de usuario en el navegador (mapa, QR → lectura) | `frontend/e2e/<flujo>.spec.js` | Playwright (perfil Pixel 7) |

## Backend (pytest)
- Usa las fixtures de `conftest.py`: `session` (transacción revertida, no deja datos), `cliente`
  (httpx contra la app) y `crear_usuario(correo, rol=..., activo=...)`; `encabezados(usuario)` de
  `tests/utilidades.py` para el token. Crea fixtures nuevas del dominio (p. ej. `crear_lote`) en
  `conftest.py` cuando las use más de un archivo.
- Casos mínimos por endpoint: éxito; 401 sin token; 403 con un rol sin permiso; 404 de un recurso
  inexistente o con `deleted_at`; 409 por duplicado (p. ej. `codigo_ica`); 422 por datos inválidos.
- Sincronización: crear dos veces con el mismo `id` no duplica; el borrado lógico deja la fila con
  `deleted_at` y desaparece de los listados.
- Geoespacial: polígono autointersectado ("moño") rechazado, trampa fuera de su lote rechazada,
  coordenadas en orden GeoJSON `[lng, lat]` cerca de Cácota (≈ −72.64, 7.27).
- MTD: sigue `/revisar-mtd` (casos calculados a mano en comentarios).
- Mensajes `detail` en español verificados textualmente cuando el usuario los ve.

## Frontend (Vitest + Testing Library)
- Consulta como un usuario: `getByRole`, `getByLabelText`, textos en español. Nada de clases CSS
  ni estado interno.
- La API se simula con `simularFetch` y `respuestaJson` de `src/test/utilidades.js`, o con
  `vi.mock` del módulo de `features/` que llame a la API. Nunca contra la API real.
- Interacción con `userEvent.setup()`; espera con `findBy…`.
- Para la sesión, envuelve con `ContextoSesion.Provider` y el router con `MemoryRouter`.
- La conversión de coordenadas (`src/utils/geo.js`) se prueba con casos explícitos `[lat, lng]` ↔
  `[lng, lat]`. Leaflet no se prueba en jsdom: eso va en E2E.

## E2E (Playwright)
- Solo flujos que crucen frontend + API + base. Selectores accesibles (`getByRole`, `getByLabel`).
- El usuario de prueba lo crea `app.scripts.sembrar_e2e` (variables `E2E_CORREO`, `E2E_CLAVE`).
  Los datos que cree una prueba deben llevar un prefijo `e2e-` y borrarse (lógicamente) al final.

## Ejecutar
- `docker compose exec api pytest --cov`
- `docker compose exec frontend npm test` (cobertura: `npm run test:cobertura`)
- E2E: `docker compose exec api python -m app.scripts.sembrar_e2e` y luego
  `docker compose --profile e2e run --rm e2e`

Reporta en una línea cuántas pruebas se agregaron y el resultado de la ejecución.
