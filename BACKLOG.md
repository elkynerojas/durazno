# Backlog — Aplicativo de trazabilidad del trampeo (Durazno Icota)

Fuente única del alcance de desarrollo. Complementa `CLAUDE.md` (stack, dominio y convenciones).
Periodo: 1 sep – 19 dic de 2026. Equipo: Ingry García y Luis Silva.

## Cómo usar este archivo (para Claude Code)

- Antes de implementar algo, ubica la historia (`HU-xx`) y respeta sus **criterios de aceptación**: son la definición de terminado.
- Trabaja una historia a la vez y en el orden del sprint actual, salvo que el usuario indique otra cosa.
- No implementes funcionalidades que no estén en este backlog sin preguntar; las de prioridad *Podría* solo si se piden.
- Al completar una tarea, marca su casilla (`- [x]`). Cuando todas las tareas y criterios se cumplan, cambia el estado de la historia a `Hecho`.
- Estados posibles: `Por hacer`, `En curso`, `En revisión`, `Hecho`.
- Menciona el ID en ramas y commits: rama `hu-09-poligono-lote`, commit `HU-09: valida polígonos con ST_IsValid`.
- Si un criterio entra en conflicto con `CLAUDE.md` o con el código existente, detente y pregunta.
- El registro oficial de avance del equipo es `Backlog_Durazno_Icota.xlsx`; si cambias estados aquí, recuérdale al usuario actualizar el Excel.

**Prioridad (MoSCoW):** Debe = imprescindible para los criterios de aceptación de la propuesta · Debería = importante, aplazable · Podría = solo si sobra tiempo.
**Puntos (Fibonacci):** 1–2 tarea pequeña · 3 un día · 5 dos o tres días · 8 casi una semana.
**Áreas de tarea:** API, Web, BD, Pruebas, Doc, Campo, DevOps.

## Sprints

| Sprint | Nombre | Fechas | Puntos | Historias |
|---|---|---|---|---|
| S0 | Análisis y diseño | 1 sep – 26 oct | 21 | HU-01, HU-02, HU-03, HU-04 |
| S1 | Lotes, trampas y acceso | 27 oct – 9 nov | 23 | HU-05, HU-06, HU-07, HU-09, HU-11 |
| S2 | QR y despliegue | 10 – 16 nov | 27 | HU-08, HU-10, HU-12, HU-13, HU-14, HU-15, HU-16, HU-17 |
| S3 | Mapa, rutas y planeación | 17 – 25 nov | 28 | HU-18, HU-19, HU-20, HU-21, HU-23, HU-24 |
| S4 | Lecturas, MTD y API | 26 nov – 4 dic | 34 | HU-22, HU-25, HU-26, HU-27, HU-28, HU-29, HU-30, HU-31 |
| S5 | Validación y cierre | 5 – 19 dic | 27 | HU-32, HU-33, HU-34, HU-35, HU-36, HU-37, HU-38 |

S4 es el sprint más cargado; si se atrasa, se recortan primero las historias *Podría* y luego las *Debería*.

## Épicas

| ID | Épica | Objetivo | Puntos |
|---|---|---|---|
| E0 | Análisis y diseño | Objetivos 1 y 2 | 16 |
| E1 | Fundación técnica y acceso | Soporte de todos los módulos | 20 |
| E2 | Lotes y trampas georreferenciados | Objetivo 3 · módulo i | 24 |
| E3 | Identificación de trampas con QR | Objetivo 3 · módulo ii | 11 |
| E4 | Mapa y rutas de monitoreo | Objetivo 3 · módulo iii | 15 |
| E5 | Planeación de actividades | Objetivo 3 · módulo iv | 18 |
| E6 | Lecturas de trampa y MTD | Objetivo 3 · módulo v | 26 |
| E7 | Servicios para la app móvil | Objetivo 3 · módulo vi | 13 |
| E8 | Validación y cierre | Objetivo 4 y entregables | 17 |

## E0 · Análisis y diseño

_Objetivos 1 y 2._ Requerimientos validados con Icota y diseño de datos, QR y API antes de programar.

### HU-01 · Requerimientos validados con Icota (SRS)

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 8 · **Sprint:** S0 · **Responsable:** Ambos
- **Historia:** Como equipo del proyecto, quiero levantar y validar los requerimientos con el personal de Icota, para construir solo lo que el trabajo de campo necesita.

**Criterios de aceptación**

- Campos de la lectura de trampa validados con al menos dos técnicos.
- Inventario de la muestra de 3 a 5 lotes con sus trampas y códigos ICA.
- Umbral de precisión de coordenadas acordado con Icota, en metros.
- Roles y permisos definidos (técnico, agrónomo, productor).
- SRS avalado por el director y los codirectores.

**Tareas**

- [ ] `HU-01.1` [Campo] Entrevistas semiestructuradas con técnicos y administración del predio
- [ ] `HU-01.2` [Campo] Observación del recorrido de trampeo en 3 a 5 lotes
- [ ] `HU-01.3` [Doc] Extraer fórmula MTD y campos del Manual ICA y la Res. 995 de 2019
- [ ] `HU-01.4` [Doc] Confirmar con el ICA el formato del reporte MTD (convenio)
- [ ] `HU-01.5` [Doc] Matriz de priorización de funcionalidades
- [ ] `HU-01.6` [Doc] Redactar el SRS (ISO/IEC/IEEE 29148) y obtener aval

### HU-02 · Documento de diseño del sistema

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 8 · **Sprint:** S0 · **Responsable:** Ambos
- **Historia:** Como equipo del proyecto, quiero cerrar el diseño de datos, del QR y de la API, para desarrollar sin rehacer el modelo a mitad de camino.

**Criterios de aceptación**

- Diagramas de casos de uso, clases, actividad y secuencia coherentes con el SRS.
- Modelo entidad-relación con geometrías, SRID 4326 y columnas de sincronización.
- Decisión del contenido del QR: identificador corto, no datos de la trampa.
- Borrador del contrato OpenAPI para los grupos de la Tabla 2.

**Tareas**

- [ ] `HU-02.1` [Doc] Diagramas de casos de uso y de actividad
- [ ] `HU-02.2` [Doc] Diagramas de clases y de secuencia (lectura por QR, cálculo MTD)
- [ ] `HU-02.3` [BD] Modelo entidad-relación geoespacial
- [ ] `HU-02.4` [Doc] Estructura del QR y formato de la etiqueta
- [ ] `HU-02.5` [API] Borrador del contrato de endpoints y códigos de error

## E1 · Fundación técnica y acceso

_Soporte de todos los módulos._ Entorno, integración continua, usuarios con roles, predio y despliegue con HTTPS.

### HU-03 · Entorno de desarrollo con Docker

- **Estado:** En curso · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S0 · **Responsable:** Ambos
- **Historia:** Como desarrollador, quiero levantar API, base de datos, frontend y pgAdmin con un comando, para trabajar igual en cualquier equipo.

**Criterios de aceptación**

- docker compose up levanta los cuatro contenedores.
- El frontend muestra la conexión con la API y la versión de PostGIS.
- Contexto de Claude Code y configuración de VS Code incluidos.

**Tareas**

- [x] `HU-03.1` [DevOps] docker-compose con db, api, frontend y pgadmin
- [x] `HU-03.2` [API] Proyecto base FastAPI con Alembic y endpoint de salud
- [x] `HU-03.3` [Web] Proyecto base React + Vite con mapa de Cácota
- [x] `HU-03.4` [Doc] CLAUDE.md, skills del proyecto y configuración de VS Code
- [ ] `HU-03.5` [DevOps] Primer arranque en el equipo de cada integrante y git init
- [x] `HU-03.6` [Pruebas] Infraestructura de pruebas: pytest con cobertura, Vitest + Testing Library y Playwright E2E
- [x] `HU-03.7` [DevOps] Endurecer la configuración local: SECRET_KEY validada, cabeceras en nginx, db y pgAdmin solo en localhost, ruff con reglas de seguridad

### HU-04 · Integración continua

- **Estado:** Por hacer · **Prioridad:** Debería · **Puntos:** 2 · **Sprint:** S0 · **Responsable:** Luis
- **Historia:** Como equipo del proyecto, quiero que cada cambio pase linters y pruebas automáticamente, para no romper lo que ya funciona.

**Criterios de aceptación**

- GitHub Actions se ejecuta en cada push y pull request.
- El flujo levanta un servicio PostGIS para las pruebas del backend.
- Falla si ruff, pytest, oxlint o el build del frontend fallan.

**Tareas**

- [ ] `HU-04.1` [DevOps] Workflow del backend: PostGIS, ruff y pytest
- [ ] `HU-04.2` [DevOps] Workflow del frontend: npm ci, lint y build
- [ ] `HU-04.3` [DevOps] Proteger la rama main y exigir revisión
- [ ] `HU-04.4` [DevOps] Pruebas del frontend (vitest) y E2E (Playwright) en el flujo
- [ ] `HU-04.5` [DevOps] Escaneo de seguridad: pip-audit, npm audit y gitleaks

### HU-05 · Iniciar sesión según el rol

- **Estado:** En curso · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S1 · **Responsable:** Luis
- **Historia:** Como usuario del sistema, quiero iniciar sesión con correo y contraseña, para acceder solo a lo que corresponde a mi rol.

**Criterios de aceptación**

- Tres roles: técnico, agrónomo y productor.
- Token de acceso de corta duración con token de renovación.
- Contraseñas guardadas con hash Argon2.
- Credenciales inválidas muestran un mensaje genérico, sin revelar si el correo existe.
- Los endpoints protegidos responden 401 sin sesión y 403 sin permiso.

**Tareas**

- [x] `HU-05.1` [BD] Modelo usuario (rol, activo) y migración
- [x] `HU-05.2` [API] Hash con pwdlib/Argon2 y emisión de tokens JWT
- [ ] `HU-05.3` [API] Endpoints /auth/token, /auth/renovar y /auth/yo
- [ ] `HU-05.4` [API] Dependencias UsuarioActual y requiere_rol
- [x] `HU-05.5` [Web] Pantalla de inicio de sesión y rutas protegidas
- [ ] `HU-05.6` [Pruebas] Login, token vencido y acceso por rol
- [ ] `HU-05.7` [API] Límite de intentos fallidos en el inicio de sesión

> Avance (commit 60ffa59): modelo usuario, Argon2, JWT, `/auth/login`, `/auth/yo` y pantalla de
> inicio de sesión. Falta `/auth/renovar`, `requiere_rol` (403) y la prueba de acceso por rol.
> Al implementar la renovación, bajar `TOKEN_MINUTOS` (hoy 720) a una duración corta.
> Divergencia por resolver: el código usa `/auth/login` y `nombre_usuario`; esta historia dice
> `/auth/token` y correo.

### HU-06 · Gestionar usuarios del predio

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S1 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero crear, editar y desactivar las cuentas del personal, para controlar quién registra datos.

**Criterios de aceptación**

- Solo el agrónomo administra cuentas.
- Desactivar una cuenta no la borra y conserva la autoría de sus lecturas.
- Datos personales mínimos, con aviso de tratamiento (Ley 1581 de 2012).
- Un usuario desactivado no puede iniciar sesión.

**Tareas**

- [ ] `HU-06.1` [API] CRUD /usuarios restringido al agrónomo
- [ ] `HU-06.2` [Web] Lista y formulario de usuarios
- [ ] `HU-06.3` [Doc] Texto de aviso de tratamiento de datos
- [ ] `HU-06.4` [Pruebas] Permisos por rol y usuario desactivado

### HU-07 · Registrar el predio

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 2 · **Sprint:** S1 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero registrar los datos del predio, para que los reportes lo identifiquen ante el ICA.

**Criterios de aceptación**

- Nombre, vereda, municipio, registro ICA del predio y área.
- Existe un único predio en esta versión.
- El límite del predio como polígono es opcional.

**Tareas**

- [ ] `HU-07.1` [BD] Modelo predio y migración
- [ ] `HU-07.2` [API] GET y PUT /predio
- [ ] `HU-07.3` [Web] Formulario de datos del predio

### HU-08 · Desplegar en servidor con HTTPS

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S2 · **Responsable:** Ingry
- **Historia:** Como técnico de campo, quiero abrir el aplicativo desde el teléfono, para usar el GPS y la lectura de QR, que exigen HTTPS.

**Criterios de aceptación**

- Dominio o subdominio con certificado válido.
- Frontend compilado servido por Nginx; API sin recarga automática.
- Copia diaria de la base (pg_dump) con una restauración probada.
- Disponible antes de las pruebas de campo.

**Tareas**

- [ ] `HU-08.1` [DevOps] docker-compose.prod.yml y variables de producción
- [ ] `HU-08.2` [DevOps] Dockerfile multietapa del frontend con Nginx
- [ ] `HU-08.3` [DevOps] Proxy /api en Nginx y certificados Let's Encrypt
- [ ] `HU-08.4` [DevOps] Copia diaria de la base y prueba de restauración
- [ ] `HU-08.5` [DevOps] Cabeceras CSP y HSTS en el Nginx de producción

## E2 · Lotes y trampas georreferenciados

_Objetivo 3 · módulo i._ Polígonos de lotes y trampas como puntos validados dentro de su lote.

### HU-09 · Dibujar el polígono de un lote

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 8 · **Sprint:** S1 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero dibujar y editar el polígono de cada lote sobre la imagen satelital, para delimitar digitalmente los lotes del predio.

**Criterios de aceptación**

- Dibujar, mover vértices y borrar con las herramientas del mapa.
- Área en hectáreas calculada en el servidor.
- Un polígono inválido (autointersección) se rechaza con un mensaje claro.
- Advertencia si el lote se traslapa con otro.
- Nombre o código de lote único.

**Tareas**

- [ ] `HU-09.1` [BD] Modelo lote con Geometry(POLYGON, 4326) y migración
- [ ] `HU-09.2` [API] CRUD /lotes en GeoJSON con borrado lógico
- [ ] `HU-09.3` [API] Validación ST_IsValid, área geodésica y ST_Overlaps
- [ ] `HU-09.4` [Web] Utilidad de conversión [lat, lng] ↔ GeoJSON
- [ ] `HU-09.5` [Web] Capa de lotes con Leaflet-Geoman y formulario
- [ ] `HU-09.6` [Pruebas] Polígono inválido, traslape y borrado lógico

### HU-10 · Importar lotes desde GeoJSON o KML

- **Estado:** Por hacer · **Prioridad:** Podría · **Puntos:** 5 · **Sprint:** S2 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero importar los límites que ya tengo de Google Earth, para no dibujarlos de nuevo.

**Criterios de aceptación**

- Acepta archivos .geojson y .kml.
- Vista previa en el mapa antes de guardar.
- Informe por elemento: aceptado o rechazado con su motivo.
- Las coordenadas con altura se convierten a 2D.

**Tareas**

- [ ] `HU-10.1` [Web] Conversión KML → GeoJSON con @tmcw/togeojson
- [ ] `HU-10.2` [Web] Vista previa y selección de elementos
- [ ] `HU-10.3` [API] Importación por lote con resultado por elemento
- [ ] `HU-10.4` [Pruebas] Archivos de muestra válidos e inválidos

### HU-11 · Registrar una trampa dentro de su lote

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S1 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero ubicar cada trampa en el mapa o por coordenadas, para saber exactamente dónde está cada una.

**Criterios de aceptación**

- Ubicación con clic en el mapa o con latitud y longitud decimales.
- El servidor rechaza un punto fuera del polígono de su lote.
- Campos: código ICA (único), tipo (Jackson o McPhail), atrayente, fecha de instalación y estado (activa, inactiva, retirada).
- Se guarda la precisión cuando la coordenada viene del GPS.
- Mover una trampa conserva su historial.

**Tareas**

- [ ] `HU-11.1` [BD] Modelo trampa con Geometry(POINT, 4326), tipo, estado y codigo_ica único
- [ ] `HU-11.2` [API] CRUD /trampas y /lotes/{id}/trampas
- [ ] `HU-11.3` [API] Validación ST_Contains con mensaje en español
- [ ] `HU-11.4` [Web] Marcadores por tipo de trampa y formulario
- [ ] `HU-11.5` [Pruebas] Punto fuera del lote y código ICA duplicado

### HU-12 · Tomar coordenadas con el GPS del teléfono

- **Estado:** Por hacer · **Prioridad:** Debería · **Puntos:** 3 · **Sprint:** S2 · **Responsable:** Ingry
- **Historia:** Como técnico de campo, quiero usar la ubicación del teléfono al registrar una trampa, para no digitar las coordenadas.

**Criterios de aceptación**

- Usa la Geolocation API en alta precisión.
- Muestra la precisión en metros antes de guardar.
- Advierte si la precisión supera el umbral acordado con Icota.
- Funciona con la página abierta y bajo HTTPS.

**Tareas**

- [ ] `HU-12.1` [Web] Botón «Usar mi ubicación» con indicador de precisión
- [ ] `HU-12.2` [Web] Advertencia por precisión insuficiente
- [ ] `HU-12.3` [Campo] Prueba en el predio con dos teléfonos Android

### HU-13 · Exportar lotes y trampas

- **Estado:** Por hacer · **Prioridad:** Debería · **Puntos:** 3 · **Sprint:** S2 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero descargar lotes y trampas en GeoJSON y KML, para abrirlos en Google Earth o QGIS.

**Criterios de aceptación**

- GeoJSON conforme a RFC 7946, con las propiedades de cada elemento.
- El KML abre correctamente en Google Earth.
- Exportación de todo el predio o de un lote.

**Tareas**

- [ ] `HU-13.1` [API] GET /export/geojson con ST_AsGeoJSON
- [ ] `HU-13.2` [API] GET /export/kml con ST_AsKML
- [ ] `HU-13.3` [Web] Botón de descarga en el mapa
- [ ] `HU-13.4` [Pruebas] Validar la salida en Google Earth y QGIS

## E3 · Identificación de trampas con QR

_Objetivo 3 · módulo ii._ Código QR único por trampa, etiquetas imprimibles y resolución del QR leído.

### HU-14 · Generar el QR de cada trampa

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S2 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero que cada trampa reciba un QR único al registrarla, para identificarla sin confusión en campo.

**Criterios de aceptación**

- Código corto de 8 caracteres sin caracteres ambiguos, asignado al crear la trampa.
- El código no cambia si la trampa se mueve.
- El QR codifica solo la URL https://<dominio>/t/<código>.
- Corrección de errores nivel Q o superior; descarga en SVG y PNG.

**Tareas**

- [ ] `HU-14.1` [BD] Campo codigo_qr único en trampa
- [ ] `HU-14.2` [API] Servicio de generación con segno
- [ ] `HU-14.3` [API] GET /trampas/{id}/qr.svg y qr.png
- [ ] `HU-14.4` [Pruebas] Unicidad y decodificación del QR generado

### HU-15 · Imprimir las etiquetas de un lote

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S2 · **Responsable:** Luis
- **Historia:** Como técnico de campo, quiero imprimir las etiquetas QR de todas las trampas de un lote, para instalarlas en un solo recorrido.

**Criterios de aceptación**

- PDF con QR, código ICA, lote y tipo de trampa.
- QR de al menos 3 cm de lado, legible a 30 cm.
- Márgenes para papel adhesivo resistente a la humedad.

**Tareas**

- [ ] `HU-15.1` [API] Generación del PDF de etiquetas con reportlab
- [ ] `HU-15.2` [Web] Botón «Imprimir etiquetas» por lote
- [ ] `HU-15.3` [Campo] Prueba de lectura de etiquetas impresas con dos teléfonos

### HU-16 · Resolver un QR leído

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S2 · **Responsable:** Luis
- **Historia:** Como técnico de campo, quiero que al escanear el QR se abra la ficha de la trampa, para registrar su lectura sin buscarla.

**Criterios de aceptación**

- GET /trampas/qr/{código} devuelve trampa, lote y ruta (servicio para la app móvil).
- La página /t/{código} muestra la trampa, su lote, la última lectura y el botón al formulario.
- Un código inexistente responde 404 con mensaje claro.
- Una trampa retirada lo indica en la ficha.

**Tareas**

- [ ] `HU-16.1` [API] Endpoint de resolución del código
- [ ] `HU-16.2` [Web] Página de ficha de la trampa
- [ ] `HU-16.3` [Pruebas] Código inexistente y trampa retirada

### HU-17 · Reponer una etiqueta deteriorada

- **Estado:** Por hacer · **Prioridad:** Debería · **Puntos:** 2 · **Sprint:** S2 · **Responsable:** Luis
- **Historia:** Como técnico de campo, quiero reimprimir o reemplazar el QR de una trampa, para que una etiqueta dañada no la deje sin identificar.

**Criterios de aceptación**

- Reimprimir conserva el mismo código.
- Reemplazar genera un código nuevo e invalida el anterior.
- Queda historial de los reemplazos.

**Tareas**

- [ ] `HU-17.1` [API] Reemplazo de código con historial
- [ ] `HU-17.2` [Web] Acciones de reimprimir y reemplazar en la ficha

## E4 · Mapa y rutas de monitoreo

_Objetivo 3 · módulo iii._ Vista del predio con el estado de cada trampa y orden de visita por lote.

### HU-18 · Ver el estado del predio en el mapa

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S3 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero ver los lotes y las trampas con su estado de monitoreo, para detectar de un vistazo qué falta revisar.

**Criterios de aceptación**

- Lotes con nombre y área.
- Trampas con ícono por tipo y color por estado: al día, pendiente o vencida según los días desde la última lectura.
- Ventana con los datos de la trampa y su última lectura.
- Leyenda, filtro por lote y uso cómodo en el teléfono.

**Tareas**

- [ ] `HU-18.1` [API] GET /mapa con FeatureCollection y estado calculado
- [ ] `HU-18.2` [Web] Íconos por tipo y estado, y leyenda
- [ ] `HU-18.3` [Web] Filtro por lote y encuadre automático
- [ ] `HU-18.4` [Pruebas] Cálculo del estado de monitoreo

### HU-19 · Definir la ruta de un lote

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 8 · **Sprint:** S3 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero fijar el orden de visita de las trampas de cada lote, para que ningún punto de monitoreo se omita.

**Criterios de aceptación**

- Ordenar con clics sucesivos en el mapa o arrastrando la lista.
- La ruta incluye todas las trampas activas del lote, sin duplicados (validado en el servidor).
- Propuesta automática por vecino más cercano, editable.
- Línea del recorrido y distancia total en el mapa.

**Tareas**

- [ ] `HU-19.1` [BD] Modelos ruta y ruta_trampa con orden
- [ ] `HU-19.2` [API] CRUD /rutas con validación de completitud
- [ ] `HU-19.3` [API] Propuesta por vecino más cercano (distancia geodésica)
- [ ] `HU-19.4` [Web] Lista arrastrable y polilínea del recorrido
- [ ] `HU-19.5` [Pruebas] Omisión, duplicado y trampa retirada

### HU-20 · Avisar rutas desactualizadas

- **Estado:** Por hacer · **Prioridad:** Debería · **Puntos:** 2 · **Sprint:** S3 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero saber qué rutas revisar cuando se instala o retira una trampa, para mantener los recorridos completos.

**Criterios de aceptación**

- La ruta afectada queda marcada «requiere revisión».
- El aviso aparece en el mapa y en la lista de rutas.

**Tareas**

- [ ] `HU-20.1` [API] Marcar rutas al crear, mover o retirar trampas
- [ ] `HU-20.2` [Web] Indicador en el mapa y en la lista

## E5 · Planeación de actividades

_Objetivo 3 · módulo iv._ Plan de 52 semanas, seguimiento de cumplimiento y ajuste según hallazgos.

### HU-21 · Programar actividades en las 52 semanas

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 8 · **Sprint:** S3 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero programar visitas de monitoreo y labores por semana, para organizar el año del cultivo.

**Criterios de aceptación**

- Tipos: visita de monitoreo (con ruta), cambio de atrayente y labor cultural.
- Cada actividad tiene semana ISO, lote y responsable.
- Repetición cada N semanas.
- Vista anual de semanas por lote.

**Tareas**

- [ ] `HU-21.1` [BD] Modelo plan_actividad y catálogo de tipos
- [ ] `HU-21.2` [API] CRUD /plan y generación de repeticiones
- [ ] `HU-21.3` [Web] Vista anual: semanas × lotes
- [ ] `HU-21.4` [Web] Formulario de actividad
- [ ] `HU-21.5` [Pruebas] Años con semana 53 y repeticiones

### HU-22 · Seguir el cumplimiento del plan

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S4 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero ver qué actividades se cumplieron y cuáles están vencidas, para corregir a tiempo.

**Criterios de aceptación**

- Estados: programada, cumplida, vencida y reprogramada.
- Una visita de monitoreo se marca cumplida al registrar las lecturas de su ruta en esa semana.
- Porcentaje de cumplimiento por semana y por lote.

**Tareas**

- [ ] `HU-22.1` [API] Cálculo del estado a partir de las lecturas
- [ ] `HU-22.2` [API] Indicadores de cumplimiento
- [ ] `HU-22.3` [Web] Colores de estado en la vista anual
- [ ] `HU-22.4` [Pruebas] Ruta completa, parcial y sin lecturas

### HU-23 · Reprogramar según los hallazgos

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S3 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero mover o agregar actividades a partir de lo encontrado en campo, para responder a un aumento de capturas.

**Criterios de aceptación**

- Mover una actividad a otra semana exige un motivo.
- Queda el historial de cambios del plan.
- Desde una lectura con capturas se puede crear una visita adicional.

**Tareas**

- [ ] `HU-23.1` [BD] Historial de cambios del plan
- [ ] `HU-23.2` [API] Reprogramación con motivo obligatorio
- [ ] `HU-23.3` [Web] Acción «Reprogramar» y visita adicional desde una lectura

### HU-24 · Ver mis actividades de la semana

- **Estado:** Por hacer · **Prioridad:** Debería · **Puntos:** 2 · **Sprint:** S3 · **Responsable:** Ingry
- **Historia:** Como técnico de campo, quiero ver lo que me toca esta semana, para organizar mis recorridos.

**Criterios de aceptación**

- Lista de la semana actual con lote, ruta y tipo de actividad.
- Acceso directo a la ruta en el mapa.

**Tareas**

- [ ] `HU-24.1` [API] GET /plan/mias?semana=
- [ ] `HU-24.2` [Web] Vista «Mi semana» para el teléfono

## E6 · Lecturas de trampa y MTD

_Objetivo 3 · módulo v._ Formulario de lectura, validación, historial y cálculo del índice MTD.

### HU-25 · Registrar la lectura de una trampa

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 8 · **Sprint:** S4 · **Responsable:** Ingry
- **Historia:** Como técnico de campo, quiero diligenciar el formulario de la trampa durante la visita, para que el dato quede ligado a la trampa, la fecha y el lugar.

**Criterios de aceptación**

- Se abre desde la ficha del QR o desde el mapa.
- Campos validados en el SRS; mínimo: fecha y hora de observación, capturas por especie, días de exposición, estado de la trampa, cambio de atrayente y observaciones.
- Días de exposición calculados desde la revisión anterior, editables con justificación.
- Guarda la posición del usuario, su precisión y la distancia a la trampa.
- Reenviar la misma lectura no la duplica.

**Tareas**

- [ ] `HU-25.1` [BD] Modelos visita y lectura_trampa (observado_en, capturas por especie, precision_m)
- [ ] `HU-25.2` [API] POST idempotente por id del cliente
- [ ] `HU-25.3` [API] Cálculo de días de exposición y distancia a la trampa
- [ ] `HU-25.4` [Web] Formulario adaptado al teléfono
- [ ] `HU-25.5` [Pruebas] Idempotencia, fecha futura y trampa inactiva

### HU-26 · Validar las lecturas

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S4 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero revisar y validar las lecturas registradas, para que solo datos confiables entren al MTD.

**Criterios de aceptación**

- Estados: registrada, validada y rechazada con motivo.
- El MTD excluye las lecturas rechazadas.
- Lista de pendientes con aviso de las tomadas lejos de la trampa.

**Tareas**

- [ ] `HU-26.1` [API] Cambio de estado con motivo y autor
- [ ] `HU-26.2` [Web] Bandeja de lecturas pendientes
- [ ] `HU-26.3` [Pruebas] Exclusión de rechazadas en el MTD

### HU-27 · Consultar el historial por trampa y por lote

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S4 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero ver las capturas en el tiempo de una trampa o un lote, para analizar el comportamiento de la plaga.

**Criterios de aceptación**

- Tabla y gráfico de capturas por fecha.
- Filtros por periodo y especie.
- Exportación a CSV.

**Tareas**

- [ ] `HU-27.1` [API] GET /historial con filtros y paginación
- [ ] `HU-27.2` [Web] Tabla y gráfico de capturas
- [ ] `HU-27.3` [API] Exportación CSV

### HU-28 · Calcular el MTD del predio

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S4 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero obtener el índice MTD por especie y por semana, para reportar la situación fitosanitaria del predio.

**Criterios de aceptación**

- MTD = M / (T × D), separado por especie (C. capitata y Anastrepha).
- Muestra los valores de M, T y D usados en cada cálculo.
- Coincide exactamente con el cálculo manual de referencia.
- Si T × D = 0 se muestra «sin dato», sin dividir por cero.
- Gráfico de tendencia semanal.

**Tareas**

- [ ] `HU-28.1` [API] Servicio calcular_mtd como función pura
- [ ] `HU-28.2` [API] GET /mtd?desde=&hasta=&especie=
- [ ] `HU-28.3` [Pruebas] Casos calculados a mano (skill /revisar-mtd)
- [ ] `HU-28.4` [Web] Tabla y tendencia semanal del MTD

### HU-29 · Exportar el reporte MTD para el ICA

- **Estado:** Por hacer · **Prioridad:** Debería · **Puntos:** 3 · **Sprint:** S4 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero descargar el consolidado semanal del MTD, para entregarlo al ICA en el formato del convenio.

**Criterios de aceptación**

- Consolidado semanal en CSV y PDF.
- Formato acordado con el ICA en el levantamiento de requerimientos.

**Tareas**

- [ ] `HU-29.1` [API] Generación del reporte en el formato acordado
- [ ] `HU-29.2` [Web] Botón de descarga por periodo

### HU-30 · Alerta por MTD alto

- **Estado:** Por hacer · **Prioridad:** Podría · **Puntos:** 2 · **Sprint:** S4 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero ver resaltadas las semanas que superan un umbral de MTD, para programar acciones de control.

**Criterios de aceptación**

- Umbral configurable por especie.
- Resaltado en la tabla y el gráfico del MTD.

**Tareas**

- [ ] `HU-30.1` [API] Configuración del umbral
- [ ] `HU-30.2` [Web] Resaltado de semanas sobre el umbral

## E7 · Servicios para la app móvil

_Objetivo 3 · módulo vi._ API documentada y preparada para la sincronización de la fase 2.

### HU-31 · Documentar la API completa

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S4 · **Responsable:** Ambos
- **Historia:** Como desarrollador de la app móvil, quiero una documentación OpenAPI completa, para integrarme sin leer el código del servidor.

**Criterios de aceptación**

- Todos los grupos de la Tabla 2 publicados bajo /api/v1.
- Cada endpoint con resumen, ejemplos y respuestas de error.
- openapi.json versionado en el repositorio.

**Tareas**

- [ ] `HU-31.1` [API] Ejemplos y respuestas de error en cada endpoint
- [ ] `HU-31.2` [DevOps] Exportar openapi.json en la integración continua

### HU-32 · Preparar la sincronización

- **Estado:** Por hacer · **Prioridad:** Debería · **Puntos:** 5 · **Sprint:** S5 · **Responsable:** Luis
- **Historia:** Como desarrollador de la app móvil, quiero consultar los cambios desde una fecha y enviar lecturas en bloque, para sincronizar lo capturado sin conexión.

**Criterios de aceptación**

- GET /sync/cambios?desde= devuelve creados, modificados y borrados por entidad.
- POST de lecturas en bloque, idempotente.
- Pruebas de reenvío sin duplicados.

**Tareas**

- [ ] `HU-32.1` [API] Endpoint de cambios por updated_at y deleted_at
- [ ] `HU-32.2` [API] Envío de lecturas en bloque
- [ ] `HU-32.3` [Pruebas] Reenvío y conflictos de actualización

### HU-33 · Probar el flujo de consumo móvil

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S5 · **Responsable:** Luis
- **Historia:** Como equipo del proyecto, quiero una prueba que recorra el flujo de la app móvil contra el servidor, para demostrar que los servicios responden según su documentación.

**Criterios de aceptación**

- Recorre: iniciar sesión → resolver QR → registrar lectura → consultar MTD.
- Se ejecuta contra el servidor desplegado.
- Los resultados quedan en el informe de pruebas.

**Tareas**

- [ ] `HU-33.1` [Pruebas] Script del flujo con httpx o REST Client
- [ ] `HU-33.2` [Doc] Registro de resultados para el informe

### HU-34 · Guía de integración de servicios

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 2 · **Sprint:** S5 · **Responsable:** Luis
- **Historia:** Como desarrollador de la app móvil, quiero una guía con el flujo de autenticación, QR y envío de lecturas, para empezar la fase 2 sin depender del equipo actual.

**Criterios de aceptación**

- Explica autenticación, resolución del QR, envío de lecturas y manejo de errores.
- Incluye ejemplos de petición y respuesta.

**Tareas**

- [ ] `HU-34.1` [Doc] Redactar la guía de integración

## E8 · Validación y cierre

_Objetivo 4 y entregables._ Pruebas funcionales y de campo, manual de usuario e informe final.

### HU-35 · Pruebas funcionales

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S5 · **Responsable:** Ingry
- **Historia:** Como equipo del proyecto, quiero un protocolo de pruebas por módulo ejecutado y documentado, para demostrar el cumplimiento de los requerimientos.

**Criterios de aceptación**

- Casos de prueba trazados a cada requerimiento del SRS.
- Resultados con evidencia y defectos corregidos o justificados.

**Tareas**

- [ ] `HU-35.1` [Doc] Diseñar el protocolo de pruebas funcionales
- [ ] `HU-35.2` [Pruebas] Ejecutar los casos y registrar evidencia
- [ ] `HU-35.3` [Doc] Informe de pruebas

### HU-36 · Validación en campo con la muestra de lotes

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S5 · **Responsable:** Ambos
- **Historia:** Como equipo del proyecto, quiero contrastar el sistema con la realidad del predio, para medir la fidelidad cartográfica y la lectura del QR.

**Criterios de aceptación**

- Error de polígonos y coordenadas dentro del umbral acordado con Icota.
- Lectura correcta del QR en al menos el 90 % de los intentos.
- Rutas sin omisiones ni duplicados en los lotes de la muestra.
- MTD idéntico al cálculo manual de referencia.

**Tareas**

- [ ] `HU-36.1` [Campo] Instalar etiquetas en las trampas de la muestra
- [ ] `HU-36.2` [Campo] Medir posiciones con GPS y comparar con la referencia
- [ ] `HU-36.3` [Campo] Registrar intentos de lectura del QR
- [ ] `HU-36.4` [Doc] Análisis de resultados

### HU-37 · Validación con el agrónomo

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 2 · **Sprint:** S5 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero verificar, validar y reprogramar actividades con datos reales, para confirmar que el sistema apoya mi trabajo.

**Criterios de aceptación**

- Sesión guiada con el agrónomo o experto de Icota.
- Observaciones registradas y ajustes priorizados.

**Tareas**

- [ ] `HU-37.1` [Campo] Sesión de validación con el agrónomo
- [ ] `HU-37.2` [Doc] Acta de observaciones y ajustes

### HU-38 · Manual de usuario e informe final

- **Estado:** Por hacer · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S5 · **Responsable:** Luis
- **Historia:** Como equipo del proyecto, quiero entregar el manual, el informe final y preparar la sustentación, para cerrar el trabajo de grado.

**Criterios de aceptación**

- Manual para el personal de campo y el agrónomo, con capturas de pantalla.
- Informe final y presentación aprobados por el director.

**Tareas**

- [ ] `HU-38.1` [Doc] Manual de usuario
- [ ] `HU-38.2` [Doc] Informe final del trabajo de grado
- [ ] `HU-38.3` [Doc] Presentación de la sustentación
