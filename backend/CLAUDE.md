# Backend (FastAPI + PostGIS)

## Estructura

```
app/
  main.py               # instancia FastAPI, CORS, montaje de /api/v1
  core/config.py        # Settings (pydantic-settings) desde variables de entorno
  db/base.py            # Base declarativa + EntidadSincronizable (UUIDv7, timestamps, deleted_at)
  db/session.py         # motor async (postgresql+psycopg) y get_session
  api/deps.py           # dependencias Annotated (SessionDep, luego UsuarioActualDep...)
  api/v1/router.py      # registra los routers de cada grupo
  api/v1/endpoints/     # un archivo por grupo de servicios
  models/               # modelos ORM (importarlos en models/__init__.py para Alembic)
  schemas/              # modelos Pydantic de entrada/salida (crear al primer módulo)
  services/             # lógica de negocio sin HTTP (MTD, rutas, QR); fácil de probar
migrations/             # Alembic (env.py ya filtra tablas de PostGIS)
tests/
```

## Patrón para un módulo nuevo (p. ej. `lote`)

1. `app/models/lote.py`: clase `Lote(EntidadSincronizable, Base)`, `__tablename__ = "lote"`,
   geometría `mapped_column(Geometry("POLYGON", srid=4326, spatial_index=True))`.
2. Importarlo en `app/models/__init__.py`.
3. `docker compose exec api alembic revision --autogenerate -m "crear lote"` y **revisar** el
   archivo generado antes de aplicarlo (Alembic no detecta todo, p. ej. CHECK o datos).
4. `app/schemas/lote.py`: `LoteCrear`, `LoteActualizar`, `LoteLeer` (con `id` opcional en `Crear`).
5. `app/api/v1/endpoints/lotes.py` y registrarlo en `router.py`.
6. Pruebas en `tests/`.

## Reglas

- Siempre async: `AsyncSession`, `await session.execute(select(...))`. Nada de I/O bloqueante en
  los endpoints.
- Dependencias con `Annotated` (`SessionDep`), no `= Depends(...)` como valor por defecto (ruff B008).
- La lógica de negocio va en `services/` como funciones puras cuando sea posible; los endpoints
  solo validan, llaman al servicio y responden.
- Geometrías: entrada/salida en GeoJSON. Convertir con `geoalchemy2.shape.to_shape/from_shape` y
  `shapely.geometry.shape/mapping`. Validar con `ST_IsValid` y `ST_Contains` en la base.
- Errores: `HTTPException` con `detail` en español y código adecuado (404, 409, 422).
- Filtrar `deleted_at IS NULL` en toda consulta de lectura.
- Python 3.13, línea máxima 100, `ruff check` y `ruff format` sin errores.

## Pruebas

- `docker compose exec api pytest` (usa la base del contenedor).
- El cálculo de MTD se prueba con casos calculados a mano, incluido el caso `T × D = 0`.
