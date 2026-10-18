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
| S2 | QR y despliegue | 10 – 16 nov | 35 | HU-08, HU-10, HU-12, HU-13, HU-14, HU-15, HU-16, HU-17, HU-39 |
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

- **Estado:** En revisión · **Prioridad:** Debería · **Puntos:** 2 · **Sprint:** S0 · **Responsable:** Luis
- **Historia:** Como equipo del proyecto, quiero que cada cambio pase linters y pruebas automáticamente, para no romper lo que ya funciona.

**Criterios de aceptación**

- GitHub Actions se ejecuta en cada push y pull request.
- El flujo levanta un servicio PostGIS para las pruebas del backend.
- Falla si ruff, pytest, oxlint o el build del frontend fallan.

**Tareas**

- [x] `HU-04.1` [DevOps] Workflow del backend: PostGIS, ruff y pytest
- [x] `HU-04.2` [DevOps] Workflow del frontend: npm ci, lint y build
- [ ] `HU-04.3` [DevOps] Proteger la rama main y exigir revisión
- [x] `HU-04.4` [DevOps] Pruebas del frontend (vitest) y E2E (Playwright) en el flujo
- [x] `HU-04.5` [DevOps] Escaneo de seguridad: pip-audit, npm audit y gitleaks

> `.github/workflows/ci.yml` en cada push y pull request: backend (servicio PostGIS 18, ruff,
> `alembic upgrade head`, pytest con cobertura), frontend (oxlint, vitest, build), E2E (stack de
> Docker Compose + Playwright, reporte como artefacto si falla) y seguridad (pip-audit, `npm audit
> --omit=dev --audit-level=high`, gitleaks sobre todo el historial). Primera corrida en verde.
> HU-04.3 queda para decidir en equipo: exigir revisión en `main` obliga a trabajar con pull
> requests aprobados por el otro integrante (`gh api repos/elkynerojas/durazno/branches/main/
> protection` con la verificación «CI» obligatoria).

### HU-05 · Iniciar sesión según el rol

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S1 · **Responsable:** Luis
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
- [x] `HU-05.3` [API] Endpoints /auth/token, /auth/renovar y /auth/yo
- [x] `HU-05.4` [API] Dependencias UsuarioActual y requiere_rol
- [x] `HU-05.5` [Web] Pantalla de inicio de sesión y rutas protegidas
- [x] `HU-05.6` [Pruebas] Login, token vencido y acceso por rol
- [x] `HU-05.7` [API] Límite de intentos fallidos en el inicio de sesión

> Inicio de sesión con correo en `POST /auth/token`; `/auth/renovar` con token de renovación
> (acceso 15 min, renovación 7 días, tope absoluto de sesión 30 días vía `auth_time`; todo
> configurable); `requiere_rol` en `app/api/deps.py` (403). Límite: 5 intentos fallidos por correo
> en 15 min → 429 con `Retry-After`, contado antes de consultar la base (resiste ráfagas), con
> tope de memoria. El contador vive en memoria de la API (se reinicia con ella y no se comparte
> entre réplicas).
> Pendientes de la auditoría, pasados a HU-08: bloqueo de cuentas ajenas por correo y rociado de
> contraseñas sin límite por IP (HU-08.6); token de renovación en `localStorage` → cookie
> `HttpOnly` y revocación de sesiones (HU-08.7). Para la fase 2: no cerrar la sesión cuando la
> renovación falla por red (solo ante 401).

### HU-06 · Gestionar usuarios del predio

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S1 · **Responsable:** Luis
- **Historia:** Como administrador, quiero crear, editar y desactivar las cuentas del personal, para controlar quién registra datos.

**Criterios de aceptación**

- Solo el administrador administra cuentas (antes el agrónomo; cambió con HU-39).
- Desactivar una cuenta no la borra y conserva la autoría de sus lecturas.
- Datos personales mínimos, con aviso de tratamiento (Ley 1581 de 2012).
- Un usuario desactivado no puede iniciar sesión.

**Tareas**

- [x] `HU-06.1` [API] CRUD /usuarios restringido al agrónomo
- [x] `HU-06.2` [Web] Lista y formulario de usuarios
- [ ] `HU-06.3` [Doc] Texto de aviso de tratamiento de datos
- [x] `HU-06.4` [Pruebas] Permisos por rol y usuario desactivado

> `GET/POST/PATCH /usuarios` solo para el agrónomo; desactivar es `PATCH activo:false` (sin
> DELETE) y corta las sesiones abiertas. El alta exige `autorizacion_datos` y guarda
> `autorizacion_datos_en`. El predio conserva siempre al menos un agrónomo activo (conteo con
> `FOR UPDATE`). HU-06.3: `AvisoDatos.jsx` es borrador; falta que lo valide el director con el
> predio. La conservación de la autoría de lecturas se prueba cuando exista `lectura_trampa`
> (HU-25). Pendientes de la auditoría, pasados a HU-08.7: restablecer la clave no revoca los
> tokens ya emitidos (y reactivar una cuenta revive los anteriores); política de claves solo por
> longitud; el agrónomo cambia su propia clave sin dar la actual. Para decidir con el director
> (Ley 1581): guardar quién registró la autorización y la versión del aviso.

### HU-07 · Registrar el predio

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 2 · **Sprint:** S1 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero registrar los datos del predio, para que los reportes lo identifiquen ante el ICA.

**Criterios de aceptación**

- Nombre, vereda, municipio, registro ICA del predio y área.
- Puede haber varios predios (HU-39); el agrónomo asignado o el administrador editan sus datos.
- El límite del predio como polígono es opcional.
- Con límite, el área la calcula el servidor (geodésica); un lote que sale del límite se guarda con advertencia.

**Tareas**

- [x] `HU-07.1` [BD] Modelo predio y migración
- [x] `HU-07.2` [API] GET y PUT /predio
- [x] `HU-07.3` [Web] Formulario de datos del predio
- [x] `HU-07.4` [Web] Dibujar, editar y quitar el límite del predio; verlo en los mapas
- [x] `HU-07.5` [API] Área desde el límite y advertencia de lotes por fuera
- [x] `HU-07.6` [API/Web] Color del límite del predio en los mapas

> Un solo predio garantizado en la base (índice único parcial `uq_predio_unico` sobre las filas
> sin `deleted_at`). `GET /predio` para cualquier rol con sesión; `PUT /predio` solo el agrónomo
> (201 al registrar, 200 al actualizar, idempotente por `id`). `registro_ica` es opcional y
> `area_ha` la declara el agrónomo. El `limite` se recibe en GeoJSON y se valida con `ST_IsValid`
> (`services/geo.py`, reutilizable en HU-09); en la web se conserva, pero dibujarlo queda para
> cuando exista la capa con Geoman (HU-09.5).

### HU-08 · Desplegar en servidor con HTTPS

- **Estado:** En curso · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S2 · **Responsable:** Ingry
- **Historia:** Como técnico de campo, quiero abrir el aplicativo desde el teléfono, para usar el GPS y la lectura de QR, que exigen HTTPS.

**Criterios de aceptación**

- Dominio o subdominio con certificado válido.
- Frontend compilado servido por Nginx; API sin recarga automática.
- Copia diaria de la base (pg_dump) con una restauración probada.
- Disponible antes de las pruebas de campo.

**Tareas**

- [x] `HU-08.1` [DevOps] docker-compose.prod.yml y variables de producción
- [x] `HU-08.2` [DevOps] Dockerfile multietapa del frontend con Nginx
- [x] `HU-08.3` [DevOps] Proxy /api en Nginx y certificados Let's Encrypt
- [x] `HU-08.4` [DevOps] Copia diaria de la base y prueba de restauración
- [x] `HU-08.5` [DevOps] Cabeceras CSP y HSTS en el Nginx de producción
- [x] `HU-08.6` [DevOps] `limit_req` por IP en Nginx para `/api/v1/auth/` y `forwarded-allow-ips` restringido al proxy (bloqueo de cuentas ajenas y rociado de contraseñas, auditoría HU-05)
- [x] `HU-08.7` [API] Token de renovación en cookie `HttpOnly; Secure; SameSite=Strict` y revocación de sesiones (`sesion_valida_desde` o `jti`), auditoría HU-05; revocar también al restablecer la clave o reactivar la cuenta, rechazar claves triviales y exigir la clave actual para cambiar la propia (auditoría HU-06)

> Listo y probado en local (stack de producción con certificado autofirmado, E2E por HTTPS):
> `docker-compose.prod.yml`, Nginx con frontend compilado, CSP/HSTS, `default_server` que
> descarta Host ajenos, `limit_req` en `/auth/token`, API sin recarga y sin root que solo confía en
> el Nginx, Swagger/ReDoc apagados (queda `/api/v1/openapi.json`), copias diarias de 14 días con
> restauración probada (`deploy/respaldo/`). Sesión: renovación en cookie `HttpOnly; Secure;
> SameSite=Strict` (cliente nativo: `X-Cliente: movil`, cada uno por su canal), acceso solo en
> memoria, revocación con `sesion_valida_desde`, claves triviales rechazadas, clave actual con
> límite de intentos, límite de login por correo+IP y por cuenta, rechazo de `Origin` ajeno.
> **Falta para cerrar:** servidor y dominio, `.env` de producción y `sh deploy/obtener-certificado.sh`.
> Pendientes de la auditoría HU-08 (decidir): detección de reuso de tokens de renovación con `jti`
> (M1); rol de base de datos sin superusuario para la API y de solo lectura para las copias (M5);
> releer `sesion_valida_desde` con bloqueo al emitir tokens (B1); agrupar IPv6 por /64 en
> `limit_req` (B6); cifrar las copias y enviarlas fuera del servidor (B4).

### HU-39 · Gestionar varios predios

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 8 · **Sprint:** S2 · **Responsable:** Ambos
- **Historia:** Como administrador, quiero crear predios y asignarles su personal, para llevar
  varios cultivos en el mismo aplicativo sin que cada equipo vea los datos de los otros.
- **Origen:** cambio de alcance pedido el 17 oct 2026 (antes la multi-predio estaba fuera de alcance).

**Criterios de aceptación**

- El administrador crea, edita y elimina (borrado lógico, sin lotes) predios desde el aplicativo.
- Cada usuario ve y trabaja solo en los predios que tiene asignados, con su rol; el administrador
  ve todos.
- Un recurso de otro predio (lote, trampa, QR, etiqueta, exportación) responde 404.
- Código de lote único dentro de cada predio; código ICA y QR únicos en todo el sistema.
- La web permite elegir el predio actual y recuerda la elección en el navegador.

**Tareas**

- [x] `HU-39.1` [BD] Rol administrador, tabla `predio_usuario` y códigos de lote por predio
- [x] `HU-39.2` [API] `/predios` (CRUD y personal) y acceso por predio en todo el dominio
- [x] `HU-39.3` [API] Cuentas administradas por el administrador; script `crear_administrador`
- [x] `HU-39.4` [Web] Selector de predio, página Predios con personal y vistas por predio
- [x] `HU-39.5` [Pruebas] Aislamiento entre predios, asignaciones y E2E del administrador

> La migración asigna las cuentas vigentes a los predios existentes (nadie pierde acceso). El
> primer administrador se nombra con `docker compose exec api python -m app.scripts.
> crear_administrador <correo>`. Control de acceso en `app/api/acceso.py`.

## E2 · Lotes y trampas georreferenciados

_Objetivo 3 · módulo i._ Polígonos de lotes y trampas como puntos validados dentro de su lote.

### HU-09 · Dibujar el polígono de un lote

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 8 · **Sprint:** S1 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero dibujar y editar el polígono de cada lote sobre la imagen satelital, para delimitar digitalmente los lotes del predio.

**Criterios de aceptación**

- Dibujar, mover vértices y borrar con las herramientas del mapa.
- Área en hectáreas calculada en el servidor.
- Un polígono inválido (autointersección) se rechaza con un mensaje claro.
- Advertencia si el lote se traslapa con otro.
- Nombre o código de lote único.

**Tareas**

- [x] `HU-09.1` [BD] Modelo lote con Geometry(POLYGON, 4326) y migración
- [x] `HU-09.2` [API] CRUD /lotes en GeoJSON con borrado lógico
- [x] `HU-09.3` [API] Validación ST_IsValid, área geodésica y ST_Overlaps
- [x] `HU-09.4` [Web] Utilidad de conversión [lat, lng] ↔ GeoJSON
- [x] `HU-09.5` [Web] Capa de lotes con Leaflet-Geoman y formulario
- [x] `HU-09.6` [Pruebas] Polígono inválido, traslape y borrado lógico
- [x] `HU-09.7` [API/Web] Color propio de cada lote en los mapas

> `/lotes`: consulta cualquier rol; crea, edita y elimina (borrado lógico) el agrónomo. Exige el
> predio registrado (409). Área geodésica `ST_Area(geography)` guardada en `area_ha`; polígono
> inválido → 422 con mensaje en español; traslape (área común > 1 m², `UMBRAL_TRASLAPE_M2` en
> `services/lotes.py`) se guarda y se avisa en `advertencias`. Código único sin distinguir
> mayúsculas entre lotes vigentes. Toda geometría fuera del rango de Colombia se rechaza
> (atrapa `[lat, lng]` invertido). Web: capa de lotes, dibujo y edición de vértices con Geoman
> y panel del lote; E2E `e2e/lotes.spec.js`. Por confirmar con el agrónomo: umbral del traslape
> y si el lote debe quedar dentro del límite del predio.

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

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S1 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero ubicar cada trampa en el mapa o por coordenadas, para saber exactamente dónde está cada una.

**Criterios de aceptación**

- Ubicación con clic en el mapa o con latitud y longitud decimales.
- El servidor rechaza un punto fuera del polígono de su lote.
- Campos: código ICA (único), tipo (Jackson o McPhail), atrayente, fecha de instalación y estado (activa, inactiva, retirada).
- Se guarda la precisión cuando la coordenada viene del GPS.
- Mover una trampa conserva su historial.

**Tareas**

- [x] `HU-11.1` [BD] Modelo trampa con Geometry(POINT, 4326), tipo, estado y codigo_ica único
- [x] `HU-11.2` [API] CRUD /trampas y /lotes/{id}/trampas
- [x] `HU-11.3` [API] Validación ST_Contains con mensaje en español
- [x] `HU-11.4` [Web] Marcadores por tipo de trampa y formulario
- [x] `HU-11.5` [Pruebas] Punto fuera del lote y código ICA duplicado

> `/trampas` y `/lotes/{id}/trampas`: consulta cualquier rol; registra, edita, mueve y elimina
> (borrado lógico) el agrónomo. Punto GeoJSON validado con `ST_Contains(lote.geom, punto)` (el
> borde no cuenta) → 422 en español; código ICA único sin distinguir mayúsculas → 409. Mover es
> un `PATCH` sobre el mismo `id`, así las lecturas (HU-25) siguen ligadas a la trampa. Además: un
> lote con trampas no se elimina y no se le puede cambiar la forma si alguna quedaría por fuera
> (409). Web: marcadores J/M con color por estado, botón «Nueva trampa» (tocar el mapa o escribir
> latitud y longitud, con el lote sugerido) y «Mover en el mapa». `precision_m` lo acepta la API;
> la captura con GPS en la web es HU-12; un `geom` nuevo sin `precision_m` la borra.
> `fecha_instalacion` es `date` (fecha de calendario, no un instante). E2E: `e2e/mapa.spec.js`.

### HU-12 · Tomar coordenadas con el GPS del teléfono

- **Estado:** En revisión · **Prioridad:** Debería · **Puntos:** 3 · **Sprint:** S2 · **Responsable:** Ingry
- **Historia:** Como técnico de campo, quiero usar la ubicación del teléfono al registrar una trampa, para no digitar las coordenadas.

**Criterios de aceptación**

- Usa la Geolocation API en alta precisión.
- Muestra la precisión en metros antes de guardar.
- Advierte si la precisión supera el umbral acordado con Icota.
- Funciona con la página abierta y bajo HTTPS.

**Tareas**

- [x] `HU-12.1` [Web] Botón «Usar mi ubicación» con indicador de precisión
- [x] `HU-12.2` [Web] Advertencia por precisión insuficiente
- [ ] `HU-12.3` [Campo] Prueba en el predio con dos teléfonos Android

> «Usar mi ubicación» en Trampas y QR (`utils/ubicacion.js`): `watchPosition` con alta precisión
> durante 15 s, se queda con la mejor lectura, muestra la precisión en vivo y la envía como
> `precision_m` (solo si el punto sigue siendo el del GPS). Advierte si supera
> `UMBRAL_PRECISION_M` = 10 m — **valor provisional, pendiente de acordar con Icota**. Exige HTTPS
> (contexto seguro). E2E con geolocalización simulada (el contenedor e2e comparte la red del
> frontend para abrir la app en localhost, contexto seguro).

### HU-13 · Exportar lotes y trampas

- **Estado:** En revisión · **Prioridad:** Debería · **Puntos:** 3 · **Sprint:** S2 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero descargar lotes y trampas en GeoJSON y KML, para abrirlos en Google Earth o QGIS.

**Criterios de aceptación**

- GeoJSON conforme a RFC 7946, con las propiedades de cada elemento.
- El KML abre correctamente en Google Earth.
- Exportación de todo el predio o de un lote.

**Tareas**

- [x] `HU-13.1` [API] GET /export/geojson con ST_AsGeoJSON
- [x] `HU-13.2` [API] GET /export/kml con ST_AsKML
- [x] `HU-13.3` [Web] Botón de descarga en el mapa
- [ ] `HU-13.4` [Pruebas] Validar la salida en Google Earth y QGIS

> `GET /export/geojson` y `/export/kml` (cualquier rol con sesión; `?lote_id=` para un lote):
> FeatureCollection RFC 7946 con `ST_AsGeoJSON` (7 decimales, sin `crs`, `properties.elemento`
> lote/trampa) y KML 2.2 con `ST_AsKML` (carpetas Lotes y Trampas, estilo por tipo, texto
> escapado). Excluye borrados. Web: «Exportar GeoJSON/KML» en el mapa y «Lote en …» en la ficha
> del lote. HU-13.4: ambos archivos abren con GDAL `ogrinfo` (el lector que usa QGIS) con
> geometrías y propiedades correctas; falta abrir el KML en Google Earth (manual).

## E3 · Identificación de trampas con QR

_Objetivo 3 · módulo ii._ Código QR único por trampa, etiquetas imprimibles y resolución del QR leído.

### HU-14 · Generar el QR de cada trampa

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S2 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero que cada trampa reciba un QR único al registrarla, para identificarla sin confusión en campo.

**Criterios de aceptación**

- Código corto de 8 caracteres sin caracteres ambiguos, asignado al crear la trampa.
- El código no cambia si la trampa se mueve.
- El QR codifica solo la URL https://<dominio>/t/<código>.
- Corrección de errores nivel Q o superior; descarga en SVG y PNG.

**Tareas**

- [x] `HU-14.1` [BD] Campo codigo_qr único en trampa
- [x] `HU-14.2` [API] Servicio de generación con segno
- [x] `HU-14.3` [API] GET /trampas/{id}/qr.svg y qr.png
- [x] `HU-14.4` [Pruebas] Unicidad y decodificación del QR generado

> `codigo_qr`: 8 caracteres con `secrets` del alfabeto `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (sin
> 0/O/1/I/L), asignado por el servidor al crear (el cliente no puede fijarlo), único incluso
> entre trampas borradas y estable al mover. La migración asignó código a las trampas existentes.
> El QR (segno, nivel Q) codifica solo `<QR_URL_BASE>/t/<código>`; `QR_URL_BASE` va en `.env` y
> fuera de desarrollo debe ser `https://`. `GET /trampas/{id}/qr.svg|qr.png` para cualquier rol
> con sesión. Las pruebas decodifican el PNG con zxing-cpp. Web: vista previa del QR y descarga
> SVG/PNG en el panel de la trampa. La ruta `/t/<código>` se resuelve en HU-16.

### HU-15 · Imprimir las etiquetas de un lote

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S2 · **Responsable:** Luis
- **Historia:** Como técnico de campo, quiero imprimir las etiquetas QR de todas las trampas de un lote, para instalarlas en un solo recorrido.

**Criterios de aceptación**

- PDF con QR, código ICA, lote y tipo de trampa.
- QR de al menos 3 cm de lado, legible a 30 cm.
- Márgenes para papel adhesivo resistente a la humedad.

**Tareas**

- [x] `HU-15.1` [API] Generación del PDF de etiquetas con reportlab
- [x] `HU-15.2` [Web] Botón «Imprimir etiquetas» por lote
- [ ] `HU-15.3` [Campo] Prueba de lectura de etiquetas impresas con dos teléfonos

> `GET /lotes/{id}/etiquetas.pdf` (cualquier rol con sesión): carta, 8 etiquetas por hoja (2 × 4)
> con margen de 1,5 cm y 6 mm entre etiquetas con líneas de corte; QR vectorial de 3,6 cm (nivel
> Q, zona en blanco ≥ 4 módulos), nombre del predio, código ICA, lote, tipo + atrayente y código
> corto para escribirlo a mano. Incluye trampas activas e inactivas, no retiradas (lote sin
> trampas instaladas → 409). Las pruebas imprimen el PDF a 200 ppp y decodifican cada QR (lado
> ≥ 3 cm). Web: «Imprimir etiquetas del lote» en Trampas y QR y en la ficha del lote del mapa.
> Pendiente HU-15.3 [Campo]: imprimir en el papel adhesivo real y leer a 30 cm con dos teléfonos
> (requiere el dominio público de HU-08 en `QR_URL_BASE`).

### HU-16 · Resolver un QR leído

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S2 · **Responsable:** Luis
- **Historia:** Como técnico de campo, quiero que al escanear el QR se abra la ficha de la trampa, para registrar su lectura sin buscarla.

**Criterios de aceptación**

- GET /trampas/qr/{código} devuelve trampa, lote y ruta (servicio para la app móvil).
- La página /t/{código} muestra la trampa, su lote, la última lectura y el botón al formulario.
- Un código inexistente responde 404 con mensaje claro.
- Una trampa retirada lo indica en la ficha.

**Tareas**

- [x] `HU-16.1` [API] Endpoint de resolución del código
- [x] `HU-16.2` [Web] Página de ficha de la trampa
- [x] `HU-16.3` [Pruebas] Código inexistente y trampa retirada

> `GET /trampas/qr/{código}` (cualquier rol con sesión; sin distinguir mayúsculas; un código mal
> formado responde 404 sin consultar la base) devuelve `trampa` y `lote`. `ruta` y
> `ultima_lectura` ya están en el contrato pero llegan en `null` hasta HU-19 (rutas) y HU-25
> (lecturas): completarlos allí. Página `/t/{código}`: ficha con lote, tipo, coordenadas y
> estado; aviso si está retirada o inactiva; «Registrar lectura» visible pero deshabilitado hasta
> HU-25 (oculto al productor); si el código no existe, permite escribir el de la etiqueta. Sin
> sesión, el inicio de sesión vuelve a la ficha (solo rutas internas).

### HU-17 · Reponer una etiqueta deteriorada

- **Estado:** En revisión · **Prioridad:** Debería · **Puntos:** 2 · **Sprint:** S2 · **Responsable:** Luis
- **Historia:** Como técnico de campo, quiero reimprimir o reemplazar el QR de una trampa, para que una etiqueta dañada no la deje sin identificar.

**Criterios de aceptación**

- Reimprimir conserva el mismo código.
- Reemplazar genera un código nuevo e invalida el anterior.
- Queda historial de los reemplazos.

**Tareas**

- [x] `HU-17.1` [API] Reemplazo de código con historial
- [x] `HU-17.2` [Web] Acciones de reimprimir y reemplazar en la ficha

> Reimprimir: `GET /trampas/{id}/etiqueta.pdf` (mismo código). Reemplazar: `POST
> /trampas/{id}/qr/reemplazar` (técnico o agrónomo; idempotente por `id`; trampa retirada → 409)
> genera un código nuevo; leer el anterior responde 410 con el aviso. Historial en la tabla
> `reemplazo_qr` (`GET /trampas/{id}/qr/reemplazos`: códigos, motivo, responsable y fecha). Los
> códigos retirados no se reutilizan. Web: «¿Etiqueta dañada?» en Trampas y QR y en la ficha
> `/t/{código}` (al reemplazar navega al código nuevo).

## E4 · Mapa y rutas de monitoreo

_Objetivo 3 · módulo iii._ Vista del predio con el estado de cada trampa y orden de visita por lote.

### HU-18 · Ver el estado del predio en el mapa

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S3 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero ver los lotes y las trampas con su estado de monitoreo, para detectar de un vistazo qué falta revisar.

**Criterios de aceptación**

- Lotes con nombre y área.
- Trampas con ícono por tipo y color por estado: al día, pendiente o vencida según los días desde la última lectura.
- Ventana con los datos de la trampa y su última lectura.
- Leyenda, filtro por lote y uso cómodo en el teléfono.

**Tareas**

- [x] `HU-18.1` [API] GET /mapa con FeatureCollection y estado calculado
- [x] `HU-18.2` [Web] Íconos por tipo y estado, y leyenda
- [x] `HU-18.3` [Web] Filtro por lote y encuadre automático
- [x] `HU-18.4` [Pruebas] Cálculo del estado de monitoreo

> `GET /mapa?predio_id=` (o `lote_id=`; cualquier rol con el predio asignado) devuelve una
> FeatureCollection con lotes y trampas, `resumen`, `umbrales` y `fecha`. Estado de monitoreo de
> las trampas activas (`services/monitoreo.py`): `al_dia` con menos de 7 días sin revisión,
> `pendiente` desde 7 y `vencida` desde 14; las inactivas y retiradas no se monitorean. Umbrales
> **provisionales** (revisión semanal del Manual ICA): acordarlos con el agrónomo de Icota. Los
> días se cuentan desde la última lectura no rechazada (HU-25) o, si no hay, desde la
> instalación. En la web: relleno del ícono por estado de monitoreo, ventana al tocar
> la trampa, indicador «Trampas por revisar», filtro por lote con encuadre.

### HU-19 · Definir la ruta de un lote

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 8 · **Sprint:** S3 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero fijar el orden de visita de las trampas de cada lote, para que ningún punto de monitoreo se omita.

**Criterios de aceptación**

- Ordenar con clics sucesivos en el mapa o arrastrando la lista.
- La ruta incluye todas las trampas activas del lote, sin duplicados (validado en el servidor).
- Propuesta automática por vecino más cercano, editable.
- Línea del recorrido y distancia total en el mapa.

**Tareas**

- [x] `HU-19.1` [BD] Modelos ruta y ruta_trampa con orden
- [x] `HU-19.2` [API] CRUD /rutas con validación de completitud
- [x] `HU-19.3` [API] Propuesta por vecino más cercano (distancia geodésica)
- [x] `HU-19.4` [Web] Lista arrastrable y polilínea del recorrido
- [x] `HU-19.5` [Pruebas] Omisión, duplicado y trampa retirada

> Una ruta vigente por lote (`uq_ruta_lote`); sus paradas (`ruta_trampa`) se reemplazan con
> `PUT` y las anteriores quedan con borrado lógico. `POST`/`PUT /rutas` exigen todas las trampas
> activas del lote una sola vez (422 con lo que falta, sobra o se repite); distancias geodésicas
> con `ST_Distance` sobre `geography`. `GET /rutas/propuesta?lote_id=` aplica vecino más cercano
> probando cada trampa como inicio (o `inicio_id`) y no guarda nada. El QR (`/trampas/qr/...`)
> ahora trae `ruta` (`orden`, `total`, `siguiente`) y la ficha `/t/...` lo muestra. Web `/rutas`:
> propuesta automática si el lote no tiene ruta, lista arrastrable con el dedo (`@dnd-kit/react`)
> o con flechas, orden con toques sucesivos en el mapa, línea del recorrido y distancia (≈ hasta
> guardar). Si cambian las trampas del lote, la vista quita las no activas y agrega las nuevas al
> final con un aviso; el marcado «requiere revisión» queda para HU-20. Tiempo estimado y
> frecuencia del mockup no se implementan (frecuencia va con la planeación, HU-21).
> Auditoría: la propuesta corre fuera del bucle de eventos y prueba como máximo 50 inicios. Se
> aceptan: el 409 por `id` ya usado confirma que ese UUID existe (como en lotes), y el listado
> por predio consulta cada ruta por separado (paginar si los lotes crecen mucho).

### HU-20 · Avisar rutas desactualizadas

- **Estado:** En revisión · **Prioridad:** Debería · **Puntos:** 2 · **Sprint:** S3 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero saber qué rutas revisar cuando se instala o retira una trampa, para mantener los recorridos completos.

**Criterios de aceptación**

- La ruta afectada queda marcada «requiere revisión».
- El aviso aparece en el mapa y en la lista de rutas.

**Tareas**

- [x] `HU-20.1` [API] Marcar rutas al crear, mover o retirar trampas
- [x] `HU-20.2` [Web] Indicador en el mapa y en la lista

> `ruta.requiere_revision` y `motivo_revision` (acumula los cambios, máx. 500 caracteres) se
> marcan en la misma transacción al instalar una trampa activa, moverla de ubicación o de lote,
> inactivarla, retirarla, reactivarla o eliminarla (`services/rutas.avisos_por_cambio`). Cambios
> de atributos que no alteran el recorrido (atrayente, código) no marcan. `PUT /rutas/{id}`
> limpia la marca, aunque el orden sea el mismo (confirmación). `GET /rutas` y `GET /mapa`
> (`properties.ruta` de cada lote) la exponen. Web: aviso en la tarjeta del mapa con enlace al
> lote, estado de la ruta en la ficha del lote, lista «Rutas del predio» en `/rutas` (sin ruta,
> al día o requiere revisión) y botón «Confirmar ruta» cuando no hay cambios de orden.

## E5 · Planeación de actividades

_Objetivo 3 · módulo iv._ Plan de 52 semanas, seguimiento de cumplimiento y ajuste según hallazgos.

### HU-21 · Programar actividades en las 52 semanas

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 8 · **Sprint:** S3 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero programar visitas de monitoreo y labores por semana, para organizar el año del cultivo.

**Criterios de aceptación**

- Tipos: visita de monitoreo (con ruta), cambio de atrayente y labor cultural.
- Cada actividad tiene semana ISO, lote y responsable.
- Repetición cada N semanas.
- Vista anual de semanas por lote.

**Tareas**

- [x] `HU-21.1` [BD] Modelo plan_actividad y catálogo de tipos
- [x] `HU-21.2` [API] CRUD /plan y generación de repeticiones
- [x] `HU-21.3` [Web] Vista anual: semanas × lotes
- [x] `HU-21.4` [Web] Formulario de actividad
- [x] `HU-21.5` [Pruebas] Años con semana 53 y repeticiones

> `plan_actividad` (predio, lote, tipo, semana ISO, año, responsable, estado, serie). Tipos:
> `visita_monitoreo` (se liga a la ruta vigente del lote; 422 si no tiene), `cambio_atrayente`
> (`tipo_trampa` jackson o mcphail) y `labor_cultural` (`labor` del catálogo: poda,
> fertilización, raleo, cosecha, riego, control de malezas, otra; `GET /plan/catalogo`). El
> responsable es un técnico o agrónomo activo asignado al predio. `repetir` crea la serie cada N
> semanas hasta una semana del mismo año, con ids deterministas (reenviar no duplica). Las semanas
> se validan contra el año (52 o 53). `PATCH` cambia responsable y notas; mover de semana queda
> para HU-23 (con motivo). `DELETE ?serie=true` borra la actividad y las siguientes de su serie.
> Web `/plan`: vista anual lotes × semanas con la actual resaltada (y a la vista al abrir), año
> anterior/siguiente, filtro por lote, formulario «Programar actividad», ficha con cambio de
> responsable y borrado, y lista de la semana actual. Los estados de cumplimiento llegan con HU-22.

### HU-22 · Seguir el cumplimiento del plan

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S4 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero ver qué actividades se cumplieron y cuáles están vencidas, para corregir a tiempo.

**Criterios de aceptación**

- Estados: programada, cumplida, vencida y reprogramada.
- Una visita de monitoreo se marca cumplida al registrar las lecturas de su ruta en esa semana.
- Porcentaje de cumplimiento por semana y por lote.

**Tareas**

- [x] `HU-22.1` [API] Cálculo del estado a partir de las lecturas
- [x] `HU-22.2` [API] Indicadores de cumplimiento
- [x] `HU-22.3` [Web] Colores de estado en la vista anual
- [x] `HU-22.4` [Pruebas] Ruta completa, parcial y sin lecturas

> Estado calculado al consultar (`services/cumplimiento.py`): cumplida > vencida (su semana
> pasó) > reprogramada/programada. Visita de monitoreo: cumplida cuando todas las trampas activas
> de su ruta tienen lectura no rechazada en esa semana; cambio de atrayente: todas las trampas
> activas de ese tipo en el lote con una lectura de esa semana que registra el cambio; ambas
> traen `avance` (hechas/total). Labores culturales: `POST /plan/{id}/cumplimiento` (su
> responsable, el agrónomo o el administrador). `GET /plan/cumplimiento?predio_id=&anio=`:
> programadas (las que ya debían hacerse), cumplidas, vencidas, reprogramadas y porcentaje, en
> total, por semana y por lote. Web: colores por estado en la vista anual, avance en la ficha y
> en «Mi semana» (con «Marcar cumplida» para las labores) y la tarjeta de cumplimiento. Nota: la
> ruta se evalúa con sus trampas activas de hoy (no se versiona la ruta por semana).

### HU-23 · Reprogramar según los hallazgos

- **Estado:** En curso · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S3 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero mover o agregar actividades a partir de lo encontrado en campo, para responder a un aumento de capturas.

**Criterios de aceptación**

- Mover una actividad a otra semana exige un motivo.
- Queda el historial de cambios del plan.
- Desde una lectura con capturas se puede crear una visita adicional.

**Tareas**

- [x] `HU-23.1` [BD] Historial de cambios del plan
- [x] `HU-23.2` [API] Reprogramación con motivo obligatorio
- [ ] `HU-23.3` [Web] Acción «Reprogramar» y visita adicional desde una lectura

> `plan_cambio` guarda cada reprogramación (semana anterior y nueva, motivo), cambio de
> responsable y eliminación, con quién y cuándo. `POST /plan/{id}/reprogramar` exige motivo
> (5–300 caracteres) y otra semana válida (también del año siguiente), deja la actividad en
> `reprogramada` y es idempotente por `id` del cambio. `GET /plan/{id}/historial` y
> `GET /plan/cambios?predio_id=` (cualquier rol del predio). Web: «Reprogramar» e «Historial» en
> la ficha de la actividad, color propio en la vista anual y tarjeta «Cambios del plan».
> **Pendiente de HU-25:** crear una visita adicional desde una lectura con capturas (HU-23.3);
> la historia se cierra cuando existan las lecturas.

### HU-24 · Ver mis actividades de la semana

- **Estado:** En revisión · **Prioridad:** Debería · **Puntos:** 2 · **Sprint:** S3 · **Responsable:** Ingry
- **Historia:** Como técnico de campo, quiero ver lo que me toca esta semana, para organizar mis recorridos.

**Criterios de aceptación**

- Lista de la semana actual con lote, ruta y tipo de actividad.
- Acceso directo a la ruta en el mapa.

**Tareas**

- [x] `HU-24.1` [API] GET /plan/mias?semana=
- [x] `HU-24.2` [Web] Vista «Mi semana» para el teléfono

> `GET /plan/mias?anio=&semana=` (por defecto la semana actual en America/Bogota): actividades
> de las que el usuario es responsable en todos sus predios asignados, con el nombre del predio y
> las paradas de la ruta en las visitas; primero las visitas, luego recambios y labores. Web
> `/mi-semana` (técnicos y agrónomos, primera opción del menú): tarjetas por actividad, semana
> anterior/siguiente (cruza de año) y «Ver la ruta en el mapa» / «Ver el lote en el mapa», que
> cambia al predio de la actividad. `sembrar_e2e` crea también el técnico de pruebas.

## E6 · Lecturas de trampa y MTD

_Objetivo 3 · módulo v._ Formulario de lectura, validación, historial y cálculo del índice MTD.

### HU-25 · Registrar la lectura de una trampa

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 8 · **Sprint:** S4 · **Responsable:** Ingry
- **Historia:** Como técnico de campo, quiero diligenciar el formulario de la trampa durante la visita, para que el dato quede ligado a la trampa, la fecha y el lugar.

**Criterios de aceptación**

- Se abre desde la ficha del QR o desde el mapa.
- Campos validados en el SRS; mínimo: fecha y hora de observación, capturas por especie, días de exposición, estado de la trampa, cambio de atrayente y observaciones.
- Días de exposición calculados desde la revisión anterior, editables con justificación.
- Guarda la posición del usuario, su precisión y la distancia a la trampa.
- Reenviar la misma lectura no la duplica.

**Tareas**

- [x] `HU-25.1` [BD] Modelos visita y lectura_trampa (observado_en, capturas por especie, precision_m)
- [x] `HU-25.2` [API] POST idempotente por id del cliente
- [x] `HU-25.3` [API] Cálculo de días de exposición y distancia a la trampa
- [x] `HU-25.4` [Web] Formulario adaptado al teléfono
- [x] `HU-25.5` [Pruebas] Idempotencia, fecha futura y trampa inactiva

> `visita` (técnico, lote y fecha de Bogotá; la crea el servidor con la primera lectura del día)
> y `lectura_trampa`: `observado_en` (con zona) además de `created_at`; capturas de *C.
> capitata* machos y hembras y de *Anastrepha* spp.; días de exposición (los calcula el servidor
> desde la lectura anterior no rechazada o la instalación; otros exigen `justificacion_dias`);
> estado de la trampa (buena, dañada, faltante, reubicada); cambio de atrayente; observaciones;
> posición del dispositivo, `precision_m` y `distancia_m` a la trampa (geodésica); `estado`
> (registrada, para HU-26). Una lectura por trampa y día de Bogotá, de cualquier técnico (409; una
> rechazada deja registrar otra); idempotente por `id` del mismo usuario. Rechaza fecha futura (5
> min de tolerancia), de hace más de 30 días, anterior a la instalación y trampas no activas.
> Ley 1581: la posición GPS solo la ven el agrónomo, el administrador y quien registró; el
> productor no ve el responsable. API: `POST /visitas/lecturas`, `GET /visitas/lecturas/preparar`, `GET
> /visitas/lecturas` (por trampa o lote) y `GET /visitas/lecturas/{id}`. El QR devuelve
> `ultima_lectura` y el mapa (HU-18) calcula el monitoreo desde la última lectura. Web:
> `/t/<código>/lectura` desde la ficha del QR o la ventana/ficha de la trampa en el mapa;
> contadores −/+, MTD de referencia de la trampa, ubicación del teléfono al abrir (si no hay
> permiso se guarda sin posición). Los campos se ajustarán cuando el SRS los valide (HU-01).

### HU-26 · Validar las lecturas

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 3 · **Sprint:** S4 · **Responsable:** Ingry
- **Historia:** Como agrónomo, quiero revisar y validar las lecturas registradas, para que solo datos confiables entren al MTD.

**Criterios de aceptación**

- Estados: registrada, validada y rechazada con motivo.
- El MTD excluye las lecturas rechazadas.
- Lista de pendientes con aviso de las tomadas lejos de la trampa.

**Tareas**

- [x] `HU-26.1` [API] Cambio de estado con motivo y autor
- [x] `HU-26.2` [Web] Bandeja de lecturas pendientes
- [x] `HU-26.3` [Pruebas] Exclusión de rechazadas en el MTD

> `POST /visitas/lecturas/{id}/revision` (agrónomo o administrador): `validada` o `rechazada`
> con motivo obligatorio (5–300); guarda quién (`revisada_por`) y cuándo; se puede cambiar de
> decisión (409 si al validar ya hay otra lectura de la trampa ese día). `GET /visitas/lecturas`
> filtra por `predio_id` y `estado`, y cada lectura trae `avisos`: tomada a más de 50 m de la
> trampa (umbral **provisional**, acordar con Icota), sin ubicación o con días de exposición
> cambiados. Las rechazadas ya no cuentan como revisión anterior ni en el monitoreo del mapa.
> Web `/lecturas`: pendientes (las más antiguas primero), validadas y rechazadas; validar,
> rechazar con motivo y «Validar las N sin avisos». Con `estado_esperado` la API responde 409 si
> otra persona ya revisó la lectura (no se pisan decisiones). Los avisos solo los ven agrónomo y
> administrador. **Decisión a confirmar:** el agrónomo puede validar las lecturas que él mismo
> registró (en un predio con un solo agrónomo no habría quién más). HU-26.3: la exclusión de las rechazadas en el MTD
> se prueba en `tests/test_mtd.py` (HU-28).

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

- **Estado:** En revisión · **Prioridad:** Debe · **Puntos:** 5 · **Sprint:** S4 · **Responsable:** Luis
- **Historia:** Como agrónomo, quiero obtener el índice MTD por especie y por semana, para reportar la situación fitosanitaria del predio.

**Criterios de aceptación**

- MTD = M / (T × D), separado por especie (C. capitata y Anastrepha).
- Muestra los valores de M, T y D usados en cada cálculo.
- Coincide exactamente con el cálculo manual de referencia.
- Si T × D = 0 se muestra «sin dato», sin dividir por cero.
- Gráfico de tendencia semanal.

**Tareas**

- [x] `HU-28.1` [API] Servicio calcular_mtd como función pura
- [x] `HU-28.2` [API] GET /mtd?desde=&hasta=&especie=
- [x] `HU-28.3` [Pruebas] Casos calculados a mano (skill /revisar-mtd)
- [x] `HU-28.4` [Web] Tabla y tendencia semanal del MTD

> `services/mtd.py` (funciones puras): *C. capitata* con las trampas Jackson y *Anastrepha* con
> las McPhail, nunca mezcladas. M = moscas de la especie; T = trampas distintas revisadas; D =
> días de exposición sumados ÷ T (si una trampa se lee dos veces en el periodo, T × D son los
> trampa-días reales; con una lectura por trampa es el promedio). Lecturas vigentes y no
> rechazadas (las registradas cuentan y se informa cuántas faltan por validar). `GET /mtd?
> predio_id=&desde=&hasta=&especie=` (por defecto las últimas 12 semanas, máximo tres años):
> filas por especie y semana ISO (también sin lecturas: `null`, «sin dato») y el consolidado
> del periodo, con M, T y D. Sin redondear en la API; 4 decimales al presentar. Pruebas con 13
> casos calculados a mano (skill /revisar-mtd). Web `/mtd`: MTD del periodo con su fórmula,
> tendencia semanal (SVG) y tabla por semana. **Pendiente:** confirmar con Icota la regla de D
> cuando una trampa se lee más de una vez en el periodo.

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
