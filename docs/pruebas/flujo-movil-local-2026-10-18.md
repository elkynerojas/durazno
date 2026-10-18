# Prueba del flujo de consumo móvil (HU-33)

Corrida en el entorno local (Docker Compose, entrando por nginx como un cliente externo) con el
técnico de pruebas en el «Predio flujo móvil». Falta repetirla contra el servidor desplegado
(HU-08) con:

```bash
FLUJO_CORREO=<técnico de pruebas> FLUJO_CLAVE=<clave> \
  python -m app.scripts.flujo_movil --url https://<dominio> --informe flujo-movil.md
```

Cada paso compara el código HTTP con el esperado y valida el cuerpo contra el esquema que
documenta el propio servidor en `/api/v1/openapi.json`. La prueba registra una lectura real:
úsese con un usuario y un predio de pruebas.

- Servidor: `http://nginx`
- Fecha: 18/10/2026 11:51 (America/Bogota)
- Documentación usada: `/api/v1/openapi.json` del mismo servidor (versión 0.1.0)
- Resultado: **10 de 10 pasos conformes**

| # | Paso | Petición | Esperado | Obtenido | ms | Esquema | Detalle |
|---|---|---|---|---|---|---|---|
| 1 | Estado del servidor | `GET /health` | 200 | 200 | 5 | conforme |  |
| 2 | Iniciar sesión | `POST /auth/token` | 200 | 200 | 36 | conforme |  |
| 3 | Usuario de la sesión | `GET /auth/yo` | 200 | 200 | 3 | conforme | rol tecnico |
| 4 | Carga completa | `GET /sync/cambios` | 200 | 200 | 35 | conforme | 2 predios, 2 trampas, 0 rutas |
| 5 | Resolver el QR | `GET /trampas/qr/{codigo}` | 200 | 200 | 13 | conforme | FM-1018-0 · lote FM-01 |
| 6 | Preparar la lectura | `GET /visitas/lecturas/preparar` | 200 | 200 | 6 | conforme | 7 días de exposición |
| 7 | Registrar la lectura | `POST /sync/lecturas` | 200 | 200 | 19 | conforme | creada (201) |
| 8 | Reenviarla | `POST /sync/lecturas` | 200 | 200 | 7 | conforme | existente (200) |
| 9 | Consultar el MTD | `GET /mtd` | 200 | 200 | 8 | conforme | capitata: M=3, T=1, D=7.00, MTD=0.4286 |
| 10 | Renovar la sesión | `POST /auth/renovar` | 200 | 200 | 3 | conforme |  |
