# Frontend (React 19 + Vite, Node 22)

## Estructura

```
src/
  main.jsx, App.jsx
  config.js              # centro del mapa (Cácota), capas base satelital/calles
  api/client.js          # único cliente HTTP; rutas relativas a /api/v1
  components/            # componentes reutilizables (MapaPredio, EstadoApi...)
  features/<modulo>/     # una carpeta por módulo: lotes, trampas, rutas, plan, mtd
```

## Reglas

- JavaScript con JSX (sin TypeScript, para alinearse con la propuesta). Componentes funcionales
  y hooks. Nombres de componentes en PascalCase y en español (`MapaPredio`, `FormularioLote`).
- Toda llamada a la API pasa por `src/api/client.js`. Nunca URLs absolutas: Vite redirige
  `/api` al contenedor `api` (ver `vite.config.js`).
- Mapas con `react-leaflet`. Dibujo y edición de polígonos con `@geoman-io/leaflet-geoman-free`
  (no usar leaflet-draw).
- **Orden de coordenadas:** Leaflet `[lat, lng]`, GeoJSON `[lng, lat]`. Convertir en un solo
  lugar (helper en `src/utils/geo.js` cuando se cree) y nunca a mano dentro de componentes.
- Los íconos de marcador por defecto de Leaflet no cargan con Vite: definir íconos propios
  (`L.divIcon` o importar las imágenes de `leaflet/dist/images`).
- Diseño responsive: debe usarse desde el navegador de un teléfono Android.
- Textos de la interfaz en español.

## Comandos

```bash
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
docker compose exec frontend npm test                # Vitest (npm run test:cobertura)
docker compose exec frontend npm audit --omit=dev
docker compose exec frontend npm install <paquete>
docker compose exec frontend npm ci                  # automático al iniciar si cambió package-lock.json
```

## Pruebas

- Vitest + Testing Library (jsdom), configurado en `vite.config.js`. Pruebas junto al archivo:
  `InicioSesion.test.jsx`. Ayudas en `src/test/` (`simularFetch`, `respuestaJson`).
- Consultar como usuario (`getByRole`, `getByLabelText`, textos en español); la API siempre simulada.
- Leaflet no se prueba en jsdom: los flujos con mapa van en Playwright (`e2e/*.spec.js`,
  `playwright.config.js`, perfil Pixel 7). Se ejecutan en el contenedor `e2e` (ver CLAUDE.md raíz).

`node_modules` vive en un volumen de Docker (no en tu carpeta), por eso los paquetes se instalan
siempre dentro del contenedor. `package.json` y `package-lock.json` sí se actualizan en tu carpeta
y van a Git.
