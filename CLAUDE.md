# Durazno Icota — Trazabilidad geolocalizada del trampeo de moscas de la fruta

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
| `pgadmin`  | pgAdmin 4 (web)                                 | http://localhost:5050             |

Contexto específico de cada parte: @backend/CLAUDE.md y @frontend/CLAUDE.md.

## Comandos

Todo se ejecuta dentro de los contenedores; no se requiere Python ni Node instalados en el equipo.

```bash
docker compose up -d --build          # levantar todo (primera vez: cp .env.example .env)
docker compose ps                     # estado de los servicios
docker compose logs -f api            # logs de un servicio
docker compose exec api pytest        # pruebas del backend
docker compose exec api ruff check . && docker compose exec api ruff format .
docker compose exec api alembic revision --autogenerate -m "descripcion"
docker compose exec api alembic upgrade head
docker compose exec frontend npm run lint
docker compose exec frontend npm install <paquete>
docker compose exec frontend npm ci                  # tras un git pull que cambie package-lock.json
docker compose exec db psql -U icota -d durazno_icota
```

La API aplica `alembic upgrade head` al arrancar. Nunca uses `docker compose down -v`
(borra la base de datos) sin que el usuario lo pida explícitamente.

## Dominio

| Entidad (tabla)        | Descripción |
|------------------------|-------------|
| `predio`               | Finca/cultivo. Único en esta versión (sin multi-tenancy). Nivel al que se consolida el MTD. |
| `lote`                 | Unidad del predio con su polígono (`Geometry(POLYGON, 4326)`). El predio tiene más de 20. |
| `trampa`               | Punto (`Geometry(POINT, 4326)`) que debe quedar contenido en el polígono de su lote. Tiene `codigo_ica` (identificador oficial), tipo y atrayente, y un QR propio. |
| `ruta`                 | Orden de visita de las trampas activas de un lote. Sin omisiones ni duplicados. |
| `plan_actividad`       | Programación por semana ISO (1–52/53) de visitas y labores del cultivo, con estado de cumplimiento. |
| `visita`               | Recorrido de un técnico en una fecha. |
| `lectura_trampa`       | Formulario de cada trampa en una visita: especímenes capturados (por especie), días de exposición, observaciones, responsable. |

Tipos de trampa (Manual ICA): **Jackson** con trimedlure → *Ceratitis capitata* (mosca del
Mediterráneo, plaga priorizada para durazno por la Res. ICA 995 de 2019); **McPhail** con proteína
hidrolizada → *Anastrepha* spp.

Roles: `tecnico` (registra lecturas), `agronomo` (define rutas, planea, valida), `productor` (consulta).

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

## Fuera de alcance (no implementar salvo que se pida)

- App móvil, trabajo sin conexión y sincronización (fase 2; solo dejar la API preparada).
- Múltiples predios o clientes (multi-tenancy).
- Registro fenológico, de enfermedades u hongos, y variables agroclimáticas (trabajo futuro).

## Seguridad

- No leer ni modificar `.env`; usar `.env.example` como referencia.
- Datos personales del personal técnico: Ley 1581 de 2012 (habeas data). No exponerlos en
  endpoints públicos ni en logs.
