# Informe de pruebas funcionales (HU-35)

- **Fecha de ejecución:** 18/10/2026.
- **Versión:** rama `hu-35-pruebas-funcionales` sobre `main` `7fad942`.
- **Entorno:** Docker Compose local (PostgreSQL 18 + PostGIS 3.6.4, API, frontend y nginx).
  La CI de GitHub Actions confirma cada push.
- **Protocolo:** [`protocolo-pruebas-funcionales.md`](protocolo-pruebas-funcionales.md).
- **Matriz de trazabilidad:** [`matriz-trazabilidad.md`](matriz-trazabilidad.md).

## 1. Resumen

| Indicador | Resultado |
|---|---|
| Casos de prueba (criterios de aceptación) | 110, de 31 historias |
| Casos con cobertura automatizada completa | 84 (76 %) |
| Casos con parte manual | 16 |
| Casos solo manuales | 10 |
| Referencias a pruebas en la matriz | 268, todas encontradas en los reportes y aprobadas |
| Casos fallidos | 0 |
| Defectos registrados | 13: 9 corregidos, 3 justificados y 1 abierto de gravedad baja (sección 5) |

| Suite | Pruebas | Aprobadas | Fallidas | Omitidas |
|---|---|---|---|---|
| pytest (API, sobre PostGIS) | 531 | 531 | 0 | 0 |
| Vitest (interfaz) | 187 | 187 | 0 | 0 |
| Playwright (E2E, Pixel 7) | 24 | 22 | 0 | 2 |
| Flujo móvil contra el servidor (`flujo_movil`) | 10 pasos | 10 | 0 | 0 |

Las dos E2E omitidas son las capturas de pantalla (`capturas.spec.js`). Solo corren con
`CAPTURAS=1` y no verifican criterios.

Además de esta corrida:

- **Prueba intermitente:** `sesion.spec.js` falló una vez en cuatro corridas completas de
  Playwright (defecto D-12). Las otras tres corridas y tres corridas aisladas pasaron.
- **Flujo móvil:** su corrida local está en
  [`flujo-movil-local-2026-10-18.md`](flujo-movil-local-2026-10-18.md).

## 2. Método

1. Se ejecutaron las tres suites con reporte JUnit (sección 6 del protocolo).
2. Un script cruzó cada referencia `archivo::prueba` de la columna «Evidencia» de la matriz con
   los reportes. Las 268 referencias existen y pasaron.
3. Los pasos manuales que no dependen de un recurso externo se ejecutaron en el entorno local
   (sección 4).

Durante la ejecución, varios casos parciales se cerraron con pruebas nuevas, en lugar de dejarlos
como pasos manuales. Esas pruebas quedan en la suite automatizada:

| Caso | Prueba nueva |
|---|---|
| CP-6-2 | `test_lecturas.py::test_desactivar_la_cuenta_conserva_la_autoria_de_sus_lecturas` |
| CP-11-5 | `test_lecturas.py::test_mover_la_trampa_conserva_sus_lecturas` |
| CP-16-2 | `VistaFichaTrampa.test.jsx` «muestra la última lectura con su enlace al historial» |
| CP-18-3 y CP-25-1 | La E2E del mapa ahora registra una lectura desde la ventana de la trampa y verifica que la ventana la muestra |
| CP-27-2 | `VistaHistorial.test.jsx` «consulta el periodo elegido» |
| CP-31-1 | `test_openapi.py::test_grupos_de_la_tabla_2_publicados_bajo_v1` |
| CP-39-4 | `test_trampas.py::test_codigo_ica_unico_tambien_entre_predios` |
| CP-39-5 | `ProveedorPredio.test.jsx`: recuerda el predio elegido tras recargar |

## 3. Resultados por épica

| Épica | Casos | Completos | Con parte manual | Solo manuales | Fallidos |
|---|---|---|---|---|---|
| E1 · Fundación técnica y acceso (HU-03 a HU-08, HU-39) | 28 | 17 | 3 | 8 | 0 |
| E2 · Lotes y trampas (HU-09 a HU-17) | 31 | 25 | 6 | 0 | 0 |
| E3 · Mapa, rutas y planeación (HU-18 a HU-24) | 22 | 18 | 4 | 0 | 0 |
| E4 a E6 · Lecturas, MTD y reportes (HU-25 a HU-29) | 18 | 15 | 2 | 1 | 0 |
| E7 · Servicios para la app móvil (HU-31 a HU-34) | 11 | 9 | 1 | 1 | 0 |

En la columna «Solo manuales» se cuentan los casos en los que no se automatiza ninguna parte. El
resultado de su ejecución está en la sección 4.

## 4. Casos con paso manual

### 4.1 Ejecutados en esta corrida

| Caso | Resultado | Evidencia |
|---|---|---|
| CP-3-1 | Aprobado | `docker compose ps`: `api`, `db`, `frontend`, `nginx` y `pgadmin` en *running* (cinco servicios: el criterio original hablaba de cuatro, antes de agregar nginx). |
| CP-3-2 | Aprobado | `GET /api/v1/health` → `{"api":"ok","base_datos":"ok","postgis":"3.6.4"}`; el encabezado del frontend muestra «API ok · PostGIS 3.6.4» (`EstadoApi.jsx`). |
| CP-3-3 | Aprobado | Existen `CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `.claude/` y `.vscode/`. |
| CP-4-1 | Aprobado | `.github/workflows/ci.yml` se dispara con `push` y `pull_request`; cada rama de esta entrega tiene su corrida en Actions. |
| CP-4-2 | Aprobado | El trabajo del backend levanta el servicio `postgis/postgis:18-3.6`. |
| CP-4-3 | Aprobado | Las corridas `39098951009` (HU-22) y `39097903550` (HU-28) quedaron en rojo porque falló Vitest, y el trabajo E2E no se ejecutó. |
| CP-33-3 | Parcial | El informe local del flujo móvil está en `docs/pruebas/`. Falta el del servidor desplegado. |

### 4.2 Pendientes, agrupados por el recurso que necesitan

| Recurso | Casos | Cuándo |
|---|---|---|
| Revisión visual en el navegador (sin recursos externos) | CP-9-1 (mover un vértice), CP-11-1 (escribir latitud y longitud), CP-18-1 (etiqueta del lote en el mapa), CP-18-2 (ícono y color de las trampas), CP-19-1 (ordenar tocando el mapa) | Antes de la validación con el agrónomo (HU-37) |
| Servidor desplegado con dominio y HTTPS (HU-08) | CP-8-1, CP-8-2, CP-8-3, CP-8-4, CP-33-2, CP-33-3 | Al desplegar |
| Teléfono Android real en el predio | CP-12-4, CP-18-4, CP-25-4 | Validación en campo (HU-36) |
| Impresora y papel adhesivo | CP-15-2, CP-15-3 | Antes de instalar las etiquetas en campo |
| Google Earth | CP-13-2 | Cuando se instale en un equipo del equipo de trabajo |
| Icota o el director | CP-6-3 (aviso de datos personales), CP-25-2 (campos de la lectura en el SRS), CP-29-2 (formato del reporte para el ICA) | Con la aprobación del SRS (HU-01) |

## 5. Defectos

Defectos encontrados durante el desarrollo, la revisión de seguridad y esta ejecución.

| Id | Encontrado en | Descripción | Gravedad | Estado |
|---|---|---|---|---|
| D-01 | Uso en Chrome (macOS, GPU Apple) | El mapa dejaba zonas sin pintar con la capa SVG de Leaflet. | Media | Corregido en `e42fa1c`: dibujo en canvas. Las E2E verifican el color en los píxeles. |
| D-02 | Uso (técnico) | Desde «Lecturas de trampa» no se podía registrar una lectura sin escanear el QR, y el técnico no veía ese menú. | Media | Corregido en `dca981c`, con E2E. |
| D-03 | Uso | La planeación sin actividades solo mostraba un texto, sin el calendario. | Baja | Corregido en `07462cd`, con E2E. |
| D-04 | CI | La prueba de la ficha del QR fallaba de forma intermitente: no esperaba el cambio de predio. | Baja | Corregido en `283aac4`. |
| D-05 | CI | La prueba del porcentaje de cumplimiento estaba en rojo al integrar HU-22. | Baja | Corregido en `1b6ecce`. |
| D-06 | Auditoría de seguridad (HU-29) | El CSV del reporte MTD no neutralizaba fórmulas en el nombre, el registro ICA, la vereda o el municipio del predio. | Media | Corregido en `4cd5d7f`, con prueba. |
| D-07 | Auditoría de seguridad (HU-29) | Un `<` o `&` en los datos del predio rompía el PDF (error 500) o inyectaba marcado. | Media | Corregido en `4cd5d7f`, con prueba. |
| D-08 | Auditoría de seguridad (HU-32) | El productor recibía el nombre del responsable de las actividades del plan (Ley 1581). | Media | Corregido en `53a8d5c`, con pruebas. |
| D-09 | Esta ejecución (CP-12-2, revisión de la guía) | La guía de integración atribuía los avisos de validación a la precisión del GPS, y la regla real es la distancia de más de 50 m o la falta de ubicación. | Baja | Corregido en `7fad942` antes de publicarla. |
| D-10 | Auditoría de seguridad (HU-29) | El CSV del historial (HU-27) no neutraliza fórmulas en el código del lote ni en el código ICA. | Baja | Justificado: esos códigos los escriben el agrónomo o el administrador. La función `celda_segura` ya existe para aplicarla si se decide. |
| D-11 | Auditoría de seguridad (HU-08 y HU-32) | El token de renovación anterior no se revoca al renovar (no hay `jti`). La carga completa de `/sync/cambios` no se pagina. | Media | Justificado: la sesión tiene un tope de 30 días y el cambio de clave revoca todas las sesiones; el volumen de un predio (unos 20 lotes) no exige paginar. Pendiente para la fase 2. |
| D-12 | Esta ejecución | `sesion.spec.js` «inicio de sesión correcto lleva al mapa del predio» falló 1 de 4 veces en la suite completa (no llegó a `/mapa` en 5 s). Aislada pasa siempre. | Baja | Abierto. Causa probable: la carga de las pruebas en paralelo durante el inicio de sesión con Argon2. La CI lo reintenta una vez (`retries: 1`). Falta confirmarlo con la traza de Playwright. |
| D-13 | Desarrollo | En el `docker-compose.yml` de desarrollo, el comando de uvicorn está partido y `--proxy-headers` no se aplica. | Baja | Justificado: solo afecta al entorno local. Producción usa `docker-compose.prod.yml`. |

## 6. Conclusión

- **Automatizado:** las 268 pruebas que respaldan los 110 casos pasan. Ningún caso falla y no hay
  defectos de gravedad alta.
- **Lo que falta del protocolo:** ejecutar los 20 casos con paso manual pendiente (sección 4.2). Seis de los manuales ya se aprobaron en esta corrida (sección 4.1).
  Dependen sobre todo del despliegue (HU-08), de las pruebas de campo (HU-36) y de las
  aprobaciones de Icota y del director (HU-01).
- **Al aprobarse el SRS:** se agregará a la matriz la columna del requerimiento y se revisará que
  cada requerimiento tenga al menos un caso.
