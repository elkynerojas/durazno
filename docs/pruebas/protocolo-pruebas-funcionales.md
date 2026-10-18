# Protocolo de pruebas funcionales (HU-35)

## 1. Objetivo

Demostrar que el aplicativo cumple los criterios de aceptación de cada historia de usuario. Cada
criterio tiene al menos un caso de prueba con evidencia verificable, y los resultados se
registran en un informe.

## 2. Alcance

- **Historias incluidas:** las implementadas de `BACKLOG.md` (estado *En revisión* o *Hecho*),
  más HU-03 y HU-08, que están *En curso*. Son 110 casos de prueba en total.
- **Historias excluidas:**
  - Las que aún no se implementan: HU-10 y HU-30, de prioridad *Podría*.
  - Las de documentación o validación externa: HU-01, HU-02 y HU-35 a HU-38.
- **Trazabilidad:** mientras el SRS no esté aprobado (HU-01), los casos se trazan a los criterios
  de aceptación del backlog. Cuando se apruebe, se agrega a la matriz la columna del requerimiento
  (RF/RNF) de cada caso.

La matriz de trazabilidad está en [`matriz-trazabilidad.md`](matriz-trazabilidad.md).

## 3. Niveles y herramientas

| Nivel | Herramienta | Qué demuestra | Dónde |
|---|---|---|---|
| Servicios (API) | pytest + httpx sobre PostgreSQL/PostGIS real | Reglas de negocio, validaciones geoespaciales, permisos por rol y predio, idempotencia, cálculo del MTD con casos hechos a mano | `backend/tests/` |
| Interfaz (Web) | Vitest + Testing Library, con la API simulada | Formularios, mensajes y vistas en español | `frontend/src/**/*.test.jsx` |
| Flujos completos (E2E) | Playwright con perfil de teléfono Android (Pixel 7), sobre el stack de Docker | Recorridos de punta a punta: dibujar lotes, ubicar trampas, rutas, plan, lecturas, MTD | `frontend/e2e/` |
| Integración móvil | `app.scripts.flujo_movil` (httpx + jsonschema) | Que el flujo de la app móvil responde según el `openapi.json` publicado | `backend/app/scripts/flujo_movil.py` |
| Manual | Paso descrito en la matriz | Lo que exige hardware o terceros: teléfono con GPS, impresora y papel, Google Earth, servidor desplegado, visto bueno de Icota o del director | Matriz, columna «Evidencia» |

## 4. Entorno

- **Equipo de desarrollo:** Docker Compose con PostgreSQL 18 + PostGIS 3.6, la API (Python 3.13,
  FastAPI), el frontend (Node 22, React 19) y nginx.
- **Integración continua:** GitHub Actions corre ruff, pytest con PostGIS, oxlint, Vitest, el
  build, Playwright y el escaneo de seguridad en cada push. Es la referencia de que el código de
  `main` pasa todas las pruebas automatizadas.
- **Pruebas de campo y del servidor:** el servidor con HTTPS (HU-08), teléfonos Android y la
  muestra de lotes del predio (HU-36).
- **Datos de prueba:**
  - Las pruebas de la API usan una transacción que se revierte, así que no dejan datos.
  - Las E2E usan el usuario de `app.scripts.sembrar_e2e` y una clave temporal.
  - Ninguna prueba usa datos personales reales.

## 5. Criterios de entrada y salida

**Entrada:**

- La historia está implementada y su rama ya se integró a `main` con la CI en verde.
- Las suites se ejecutan sobre un commit identificado.

**Salida (por caso):**

- **Aprobado:** todas sus pruebas automatizadas pasan y, si tiene paso manual, este se ejecutó
  con evidencia (captura, archivo o acta).
- **Pendiente:** el paso manual aún no se ejecuta porque depende de un recurso externo. Se indica
  cuál.
- **Fallido:** alguna prueba falla o el paso manual no da el resultado esperado. Se registra
  como defecto.

**Salida (del protocolo):**

- Ningún caso fallido sin defecto registrado.
- Todo defecto queda corregido, o justificado con su riesgo.

## 6. Procedimiento de ejecución

1. Identificar el commit: `git rev-parse --short HEAD`.
2. Ejecutar las suites con reporte JUnit:

   ```bash
   docker compose exec api pytest --junitxml=/tmp/pytest.xml
   docker compose exec frontend npx vitest run --reporter=default --reporter=junit \
     --outputFile.junit=/tmp/vitest.xml
   docker compose exec api python -m app.scripts.sembrar_e2e
   docker compose --profile e2e run --rm -e PLAYWRIGHT_JUNIT_OUTPUT_NAME=/app/e2e-junit.xml \
     e2e npx playwright test --retries=0 --reporter=list,junit
   ```

3. Cruzar los reportes con la matriz. Cada referencia `archivo::prueba` de la columna
   «Evidencia» debe existir en un reporte y haber pasado. Una referencia que no exista se trata
   como caso fallido.
4. Ejecutar el flujo móvil (sección 9 de `docs/guia-integracion.md`) y guardar su informe.
5. Ejecutar los pasos manuales disponibles y guardar la evidencia en `docs/pruebas/evidencias/`
   con el nombre del caso (p. ej. `CP-15-2.jpg`).
6. Registrar los resultados y los defectos en el informe.

## 7. Gestión de defectos

Cada defecto se registra con:

- Un identificador `D-nn`.
- El caso o la actividad que lo encontró.
- La descripción y la gravedad (alta, media o baja).
- El estado: corregido (con el commit) o justificado (con el motivo y el riesgo).

Una corrección se entrega con la prueba que la demuestra, y esa prueba queda en la suite
automatizada.
