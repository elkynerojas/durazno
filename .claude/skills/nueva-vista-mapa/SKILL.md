---
name: nueva-vista-mapa
description: Crea o extiende una vista del frontend (React + react-leaflet + Leaflet-Geoman) para un módulo del dominio — lotes, trampas, rutas, plan, mtd — siguiendo frontend/CLAUDE.md. Úsalo para pantallas, formularios, capas o controles del mapa.
argument-hint: [módulo] [qué debe hacer la vista]
---

Crea la vista **$ARGUMENTS** siguiendo `CLAUDE.md` y `frontend/CLAUDE.md`.

Antes de escribir código:
1. Revisa lo que ya existe: `src/api/client.js`, `src/components/` (p. ej. `MapaPredio`),
   `src/features/`, `src/utils/` y `src/config.js`. Reutiliza antes de crear.
2. Revisa el endpoint que vas a consumir en `backend/app/api/v1/endpoints/` y su esquema: la vista
   se ajusta a la API, no al revés. Si el endpoint no existe, avisa (es tarea [API] de la HU).
3. Propón en una lista corta los componentes, el estado y las llamadas a la API.

Reglas al implementar:
- Archivos en `src/features/<modulo>/`, componentes en PascalCase y en español
  (`CapaLotes`, `FormularioTrampa`). JavaScript con JSX, sin TypeScript.
- Toda llamada pasa por `api()` de `src/api/client.js`; maneja `ErrorApi` mostrando su `detalle`
  (los mensajes del servidor ya vienen en español).
- **Coordenadas:** la conversión `[lat, lng]` ↔ GeoJSON `[lng, lat]` vive solo en `src/utils/geo.js`
  (créalo si no existe, con funciones como `geojsonALeaflet` y `leafletAGeojson`). Nunca inviertas
  coordenadas a mano en un componente.
- Dibujo y edición de polígonos con `@geoman-io/leaflet-geoman-free` (no leaflet-draw).
- Íconos propios con `L.divIcon` (los de Leaflet por defecto no cargan con Vite). Ícono por tipo de
  trampa (Jackson / McPhail) y color por estado cuando aplique.
- La validación del frontend es solo ayuda visual: el servidor decide (`ST_IsValid`, `ST_Contains`).
- Responsive para el navegador de un teléfono Android: controles táctiles grandes, sin hover obligatorio.
- Textos en español; fechas presentadas en America/Bogota.
- Respeta el rol del usuario de la sesión (`features/auth/`) para mostrar u ocultar acciones.

Pruebas (skill `escribir-pruebas`): Vitest + Testing Library junto a cada componente o utilidad
nueva (`<Archivo>.test.jsx`), con la API simulada; si la vista agrega un flujo de usuario nuevo,
una prueba Playwright en `frontend/e2e/`.

Al terminar ejecuta `docker compose exec frontend npm test`, `docker compose exec frontend npm run lint` y
`docker compose exec frontend npm run build`, y reporta en una línea qué quedó y cómo probarlo en
http://localhost:5173.
