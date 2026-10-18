# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Durazno Icota — Trazabilidad geolocalizada del trampeo de moscas de la fruta

Aplicativo web para registrar y georreferenciar los lotes y las trampas de un predio
productor de durazno, generar un código QR por trampa, visualizar el predio en un mapa,
definir rutas de monitoreo, planear actividades (52 semanas) y calcular el índice MTD
según el Manual Técnico de Trampeo del ICA (Plan Nacional de Moscas de la Fruta, PNMF).

- Caso de estudio: empresa productora de la vereda Icota, municipio de Cácota (Norte de Santander).
- Trabajo de grado, Tecnología en Gestión de Redes y Sistemas Teleinformáticos, ISER (semillero ORION).
- Periodo: 1 sep – 19 dic 2026. Desarrollo por iteraciones de 1–2 semanas.
- Fase 2 (fuera de esta entrega): app móvil que consumirá esta API (lectura de QR, formulario en
  campo, GPS, trabajo sin conexión). Todo lo que se construya debe poder consumirse por la API.

## Stack y servicios (Docker Compose)

| Servicio   | Tecnología                                      | URL local                         |
|------------|-------------------------------------------------|-----------------------------------|
| `db`       | PostgreSQL 18 + PostGIS 3.6                     | `localhost:5432`                  |
| `api`      | Python 3.13, FastAPI, SQLAlchemy 2 async, GeoAlchemy2, Alembic, psycopg 3 | http://localhost/docs |
| `frontend` | Node 22, React 19, Vite, Leaflet + react-leaflet, Leaflet-Geoman | http://localhost:5173 |
| `nginx`    | Proxy inverso: publica la API (la API no tiene puerto propio en el equipo) | http://localhost (`:80`) |
| `pgadmin`  | pgAdmin 4 (web)                                 | http://localhost:5050             |
| `e2e`      | Playwright (perfil `e2e`; no arranca con `up`)  | —                                 |

Contexto específico de cada parte: @backend/CLAUDE.md y @frontend/CLAUDE.md.

## Comandos

Todo se ejecuta dentro de los contenedores; no se requiere Python ni Node instalados en el equipo.

```bash
docker compose up -d --build          # levantar todo (primera vez: cp .env.example .env)
docker compose ps                     # estado de los servicios
docker compose logs -f api            # logs de un servicio
docker compose exec api pytest --cov  # pruebas del backend con cobertura
docker compose exec api ruff check . && docker compose exec api ruff format .
docker compose exec api alembic revision --autogenerate -m "descripcion"
docker compose exec api alembic upgrade head
docker compose exec frontend npm run lint
docker compose exec frontend npm test                # Vitest
docker compose exec frontend npm install <paquete>
docker compose exec frontend npm ci                  # automático al iniciar si cambió package-lock.json
docker compose exec db psql -U icota -d durazno_icota
```

Pruebas E2E (Playwright, servicio `e2e` con perfil propio; no arranca con `up`):

```bash
docker compose exec api python -m app.scripts.sembrar_e2e   # administrador E2E_CORREO y técnico E2E_TECNICO_CORREO, clave E2E_CLAVE
docker compose --profile e2e run --rm e2e
```

Una sola prueba:

```bash
docker compose exec api pytest tests/test_auth.py::test_login_clave_incorrecta -q
docker compose exec frontend npx vitest run src/api/client.test.js -t "cierra la sesión"
docker compose --profile e2e run --rm e2e npx playwright test e2e/sesion.spec.js
```

Depuración de la API: `docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d api`
levanta debugpy en el puerto 5678 **sin recarga automática** (reiniciar la API tras cada cambio);
luego en VS Code "API: adjuntar depurador (Docker)".

Producción (HU-08; variables en `.env.prod.example`, copiar como `.env` en el servidor):

```bash
docker compose -f docker-compose.prod.yml up -d --build
sh deploy/obtener-certificado.sh          # primera vez, con el dominio apuntando al servidor
docker compose -f docker-compose.prod.yml exec respaldo sh /respaldo/probar-restauracion.sh
```

La API aplica `alembic upgrade head` al arrancar. Nunca uses `docker compose down -v`
(borra la base de datos) sin que el usuario lo pida explícitamente.

## Cómo encaja todo

- **Peticiones:** el navegador entra a Vite (`:5173`), que redirige `/api` a `api:8000`
  (`frontend/vite.config.js`); por eso el frontend nunca usa URLs absolutas. Swagger y los
  clientes externos entran por nginx (`:80` → `api:8000`, `nginx/default.conf`).
- **Sesión (frontend):** el token de acceso vive solo en memoria (`features/auth/sesion.js`); el de
  renovación, en la cookie `HttpOnly` `icota_renovacion`, que JavaScript no lee. `api/client.js`
  envía el de acceso y, ante un 401, intenta una vez `/auth/renovar` (la cookie viaja sola); si
  falla, borra la sesión y emite `EVENTO_SESION_CERRADA`. Al abrir la página `ProveedorSesion`
  recupera la sesión con `restaurarSesion()`; `RutaProtegida` protege las vistas y recuerda la ruta
  pedida (p. ej. `/t/<código>`) para volver tras iniciar sesión.
- **Sesión (backend):** inicio con correo en `POST /auth/token` (acceso de 15 min + renovación de
  7 días con rotación, límite de intentos en `services/intentos.py`). La renovación va en cookie
  (`SameSite=Strict`, `Secure` fuera de desarrollo); un cliente nativo la recibe en el cuerpo con
  `X-Cliente: movil`. `UsuarioActualDep` (`app/api/deps.py`) decodifica el JWT y recarga el
  usuario en cada petición (activo, sin `deleted_at` y con el token emitido después de
  `sesion_valida_desde`, que sube al cambiar clave, rol o estado); `requiere_rol("agronomo", ...)`
  añade el 403 por rol.
- **Migraciones:** un modelo que no se importe en `app/models/__init__.py` no lo ve Alembic.
  `migrations/env.py` ignora las tablas de PostGIS y usa los ayudantes de GeoAlchemy2; `db/base.py`
  fija nombres predecibles de restricciones. El `server_default=uuidv7()` exige PostgreSQL 18; las
  extensiones se crean en `db/init/01-extensiones.sql` (solo al crear el volumen).
- **Pruebas del backend:** necesitan `db` arriba; usan la base de desarrollo dentro de una
  transacción que se revierte.

## Dominio

| Entidad (tabla)        | Descripción |
|------------------------|-------------|
| `predio`               | Finca/cultivo. Hay varios; el administrador los crea. Nivel al que se consolida el MTD. |
| `predio_usuario`       | Asignación de un usuario a un predio: cada usuario solo ve y trabaja en sus predios asignados. |
| `lote`                 | Unidad del predio con su polígono (`Geometry(POLYGON, 4326)`). El predio tiene más de 20. |
| `trampa`               | Punto (`Geometry(POINT, 4326)`) que debe quedar contenido en el polígono de su lote. Tiene `codigo_ica` (identificador oficial), tipo y atrayente, y un QR propio. |
| `ruta`                 | Orden de visita de las trampas activas de un lote. Sin omisiones ni duplicados. |
| `plan_actividad`       | Programación por semana ISO (1–52/53) de visitas y labores del cultivo, con estado de cumplimiento. |
| `visita`               | Recorrido de un técnico en una fecha. |
| `lectura_trampa`       | Formulario de cada trampa en una visita: especímenes capturados (por especie), días de exposición, observaciones, responsable. |

Tipos de trampa (Manual ICA): **Jackson** con trimedlure → *Ceratitis capitata* (mosca del
Mediterráneo, plaga priorizada para durazno por la Res. ICA 995 de 2019); **McPhail** con proteína
hidrolizada → *Anastrepha* spp.

Roles: `tecnico` (registra lecturas), `agronomo` (define rutas, planea, valida; gestiona lotes y
trampas de sus predios), `productor` (consulta), `administrador` (crea predios, asigna personal,
administra cuentas y ve todos los predios). El acceso por predio vive en `app/api/acceso.py`
(`exigir_predio`, `exigir_lote`): todo recurso del dominio se valida contra el predio al que
pertenece y responde 404 si el usuario no lo tiene asignado. Código de lote único por predio;
código ICA y código QR únicos en todo el sistema.

### Índice MTD (moscas/trampa/día)

```
MTD = M / (T × D)
M = moscas capturadas (de una especie) en el periodo
T = número de trampas revisadas (activas) en el periodo
D = días promedio de exposición de las trampas
```

- Se calcula **por especie/tipo de trampa** (no mezclar *C. capitata* con *Anastrepha*).
- Se consolida a nivel de **predio**; el historial por lote y por trampa es solo de consulta.
- Si `T × D = 0`, el MTD no está definido: devolver `null`, nunca dividir por cero.
- La exactitud se valida contra un cálculo manual de referencia (criterio de aceptación).
  Toda función de MTD debe tener pruebas con datos de ejemplo calculados a mano.

## Convenciones obligatorias

**Datos y sincronización (preparación para la fase 2):**
- Toda tabla del dominio hereda `Base` + `EntidadSincronizable` (`backend/app/db/base.py`):
  `id` UUIDv7, `created_at`, `updated_at`, `deleted_at` (borrado lógico).
- La API acepta `id` enviado por el cliente al crear (registros creados sin conexión).
- Nunca borrar filas físicamente desde la API: marcar `deleted_at`. Las consultas filtran
  `deleted_at IS NULL` por defecto.
- Las escrituras deben ser idempotentes: reenviar la misma lectura (mismo `id`) no la duplica.
- Fechas siempre `timestamptz`. En lecturas guardar `observado_en` (momento en campo) además de
  `created_at` (llegada al servidor).
- Toda coordenada capturada por dispositivo guarda su precisión: `precision_m`.

**Geoespacial:**
- SRID 4326 (WGS 84) en todas las geometrías.
- GeoJSON usa `[longitud, latitud]`; Leaflet usa `[latitud, longitud]`. Convertir siempre
  en el borde (frontend) y nunca guardar coordenadas invertidas. Es el error más común.
- Validar en el servidor: `ST_IsValid` para polígonos y `ST_Contains(lote.geom, trampa.geom)`
  para trampas. La validación del frontend es solo ayuda visual.
- Intercambio de geometrías en GeoJSON (RFC 7946); exportación adicional en KML.

**API:**
- Todo bajo `/api/v1`. Un router por grupo de servicios: `auth`, `lotes`, `trampas` (incluye QR),
  `rutas`, `visitas`, `mtd`, `plan`.
- Cada endpoint con `summary`, modelos Pydantic de entrada y salida y códigos de error
  documentados: la documentación OpenAPI es un entregable para la fase 2.
- El QR codifica solo una URL corta con el identificador de la trampa; la API la resuelve
  (`GET /api/v1/trampas/qr/{codigo}`). Se genera en el backend con `segno` (nivel de corrección Q o H).

**Código:**
- Nombres del dominio en español y sin tildes (`lote`, `trampa`, `lectura_trampa`, `calcular_mtd`).
- Mensajes al usuario en español. Zona horaria de presentación: America/Bogota.
- Cambios pequeños y verificables. Ejecutar pruebas y linters antes de dar algo por terminado.

## Flujo de trabajo con IA

`BACKLOG.md` es la fuente única del alcance: épicas, historias (`HU-xx`) y sprints S0–S5. Léelo
antes de implementar; los **criterios de aceptación** de cada historia son la definición de terminado.

- Una historia a la vez, en el orden del sprint actual. Nada fuera del backlog sin preguntar;
  las de prioridad *Podría* solo si se piden.
- Rama `hu-xx-slug` (p. ej. `hu-09-poligono-lote`); commits `HU-xx: <resumen en infinitivo>`.
- Marca cada tarea `- [x]` al terminarla y actualiza el estado (`Por hacer` → `En curso` →
  `En revisión` → `Hecho`). Recuerda al usuario actualizar `Backlog_Durazno_Icota.xlsx`.
- Si un criterio choca con este archivo o con el código existente, detente y pregunta.

| Skill | Cuándo |
|---|---|
| `/estado-sprint` | Ver avance del sprint y qué sigue. |
| `/trabajar-hu HU-xx` | Arrancar o continuar una historia de punta a punta. |
| `/cerrar-hu HU-xx` | Verificar criterios y convenciones antes de pasarla a revisión. |
| `/nuevo-modulo` | Entidad del backend: modelo, migración, esquemas, endpoints y pruebas. |
| `/nueva-vista-mapa` | Vista o capa del frontend con react-leaflet y Geoman. |
| `/revisar-mtd` | Cualquier código del cálculo o historial MTD. |
| `/documentar-api` | Completar OpenAPI y exportar `openapi.json` (HU-31). |
| `/escribir-pruebas` | Pruebas pytest, Vitest o Playwright de un archivo, módulo o HU. |
| `/auditar-seguridad` | ruff `S`, pip-audit, npm audit, gitleaks y revisión de seguridad. |

| Agente | Cuándo |
|---|---|
| `experto-geoespacial` | Antes de escribir consultas o validaciones espaciales. |
| `revisor-convenciones` | Revisar un diff contra estas convenciones (antes de commit). |
| `verificador-criterios` | Mapear los criterios de una HU a código, pruebas y resultados. |
| `auditor-seguridad` | Revisar autenticación, permisos, archivos o datos personales (OWASP API). |
| `redactor-tecnico` | Tareas [Doc] (SRS, diagramas, guías, manual), solo si se piden. Escribe en `docs/`. |

## Fuera de alcance (no implementar salvo que se pida)

- App móvil, trabajo sin conexión y sincronización (fase 2; solo dejar la API preparada).
- Registro fenológico, de enfermedades u hongos, y variables agroclimáticas (trabajo futuro).

## Pruebas

- Toda tarea [API] o [Web] se entrega con sus pruebas; una historia no se cierra con pruebas en rojo.
- Backend: pytest con fixtures de `backend/tests/conftest.py` (transacción revertida, no deja datos).
- Frontend: Vitest + Testing Library junto a cada archivo (`*.test.jsx`), con la API simulada.
- E2E: Playwright en `frontend/e2e/`, perfil de teléfono Android, solo flujos completos.
- Detalle y casos mínimos por endpoint: skill `/escribir-pruebas`.

## Seguridad

- No leer ni modificar `.env`; usar `.env.example` como referencia. Nunca secretos en el código.
- Datos personales del personal técnico: Ley 1581 de 2012 (habeas data). No exponerlos en
  endpoints públicos ni en logs.
- Todo endpoint del dominio exige sesión y rol; los esquemas de entrada no aceptan campos
  privilegiados (`rol`, `activo`, `clave_hash`, `deleted_at`) salvo en los endpoints del rol que
  los administra (p. ej. usuarios, HU-06). SQL siempre con parámetros.
- Fuera de `development`/`test` la API no arranca con una `SECRET_KEY` débil.
- PostgreSQL y pgAdmin solo escuchan en `127.0.0.1`; nginx envía cabeceras de seguridad. En
  producción (`nginx/prod/`) además CSP, HSTS y límite por IP en `/api/v1/auth/token`.
- Contraseñas: se rechazan las triviales (`services/claves.py`) y cambiar la propia exige la actual.
- Ruff incluye las reglas de seguridad `S` (bandit): un `# noqa: S…` siempre con su motivo.
- Antes de cerrar historias que toquen autenticación, permisos, archivos o datos personales:
  agente `auditor-seguridad` o `/auditar-seguridad`.
