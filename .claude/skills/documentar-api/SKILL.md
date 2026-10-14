---
name: documentar-api
description: Revisa y completa la documentación OpenAPI de los endpoints /api/v1 (summary, modelos, errores, ejemplos) y exporta openapi.json para la app móvil de la fase 2 (HU-31).
argument-hint: [grupo de endpoints opcional: auth, lotes, trampas, rutas, visitas, mtd, plan]
---

Documenta los endpoints de **$ARGUMENTS** (todos los grupos si viene vacío). La documentación
OpenAPI es un entregable para la fase 2: un desarrollador debe integrarse sin leer el código.

1. Recorre `backend/app/api/v1/endpoints/` y `router.py`. Por cada endpoint verifica:
   - `summary` en español y `description` cuando el comportamiento no es obvio
     (idempotencia por `id`, borrado lógico, validaciones geoespaciales).
   - `response_model` y modelos Pydantic de entrada; nada de `dict` sueltos.
   - `responses` con cada error posible (401, 403, 404, 409, 422) y su descripción. Reutiliza
     constantes por router como `ERROR_401` en `endpoints/auth.py`.
   - Ejemplos en los esquemas (`model_config = {"json_schema_extra": {"examples": [...]}}` o
     `Field(examples=...)`), con coordenadas reales de Cácota en orden GeoJSON `[lng, lat]`.
   - `tags` igual al grupo del router.
   - Que no exponga datos personales del personal técnico (Ley 1581).
2. Reporta una tabla: endpoint · qué falta. Corrige lo que falte sin cambiar el comportamiento.
3. Exporta el esquema a `backend/openapi.json`:
   `docker compose exec api python -c "import json; from app.main import app; print(json.dumps(app.openapi(), ensure_ascii=False, indent=2))" > backend/openapi.json`
4. Ejecuta `docker compose exec api ruff check .` y `docker compose exec api pytest`.
