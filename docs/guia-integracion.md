# Guía de integración de servicios para la app móvil

Esta guía es para quien construya la app móvil de la fase 2 (lectura de QR, formulario en campo,
GPS y trabajo sin conexión). Explica cómo autenticarse, resolver el QR de una trampa, enviar
lecturas y manejar los errores, con ejemplos tomados del servidor.

La referencia completa de cada servicio está en el esquema OpenAPI. Está versionado en
`backend/openapi.json` y el servidor lo publica en `GET /api/v1/openapi.json`. Esta guía no lo
repite: explica cómo se usan los servicios juntos.

## 1. Convenciones

| Tema | Regla |
|---|---|
| Dirección base | `https://<dominio>/api/v1`. En desarrollo, `http://localhost/api/v1` (nginx). |
| Formato | JSON en UTF-8. La única excepción es el inicio de sesión, que va como formulario. |
| Ids | UUID. Los registros que crea la app llevan un `id` generado en el teléfono (se recomienda UUIDv7). Reenviar el mismo `id` no duplica el registro. |
| Fechas | ISO 8601 **con zona horaria** (`2026-10-18T12:01:41-05:00`). Las fechas de calendario (`2026-10-11`) son de America/Bogota. |
| Coordenadas | GeoJSON (RFC 7946) en WGS 84, en orden **`[longitud, latitud]`**. En Cácota la longitud es cercana a −72,6 y la latitud a 7,27; un par invertido cae fuera de Colombia y el servidor lo rechaza. |
| Precisión GPS | Toda posición tomada con el GPS va con `precision_m` (metros). |
| Borrado | Nada se borra físicamente. Lo borrado deja de aparecer en las consultas y llega en `borrados` al sincronizar (sección 4). |
| Errores | Cuerpo `{"detail": "..."}` con el mensaje en español, listo para mostrarlo (sección 7). |

## 2. Roles

| Rol | En la app |
|---|---|
| `tecnico` | Lee QR, registra lecturas, consulta su semana y el MTD. |
| `agronomo` | Lo del técnico, más gestión: validar lecturas, planear y editar lotes y trampas. |
| `productor` | Solo consulta. No registra lecturas (`403`) y no recibe datos del personal (sección 8). |
| `administrador` | Ve todos los predios. |

Cada usuario solo ve los predios que tiene asignados. Un recurso de otro predio responde `404`,
igual que uno inexistente.

## 3. Autenticación

La API usa OAuth2 (*password flow*) con dos tokens:

- **Acceso.** Un JWT `Bearer` que dura 15 minutos (`expires_in`, en segundos). Va en el
  encabezado `Authorization` de cada petición.
- **Renovación.** Dura 7 días y sirve para pedir un acceso nuevo sin volver a escribir la clave.
  Cada renovación entrega uno nuevo. Una sesión dura como máximo 30 días desde que se inició
  sesión; después hay que iniciarla de nuevo.

En el navegador, la renovación viaja en una cookie `HttpOnly`. **La app debe enviar el encabezado
`X-Cliente: movil` al iniciar sesión y al renovar.** Así el servidor entrega el token de
renovación en el cuerpo de la respuesta, porque la app no usa cookies.

### 3.1 Iniciar sesión

```http
POST /api/v1/auth/token
Content-Type: application/x-www-form-urlencoded
X-Cliente: movil

username=tecnico%40example.com&password=<clave>
```

El correo va en `username`. Respuesta `200`:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOi…",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOi…",
  "token_type": "bearer",
  "expires_in": 900
}
```

Guarde el `refresh_token` en el almacenamiento seguro del sistema (Android Keystore, iOS
Keychain). El `access_token` puede vivir solo en memoria. Nunca escriba los tokens en registros
ni en reportes de errores.

| Respuesta | Qué hacer |
|---|---|
| `401` `"Correo o contraseña incorrectos"` | Mostrar el mensaje. Se responde igual para un correo inexistente o una cuenta desactivada. |
| `429` `"Demasiados intentos…"` | Hubo 5 fallos en 15 minutos. Esperar los segundos del encabezado `Retry-After` antes de habilitar otro intento. |

### 3.2 Saber quién inició sesión

`GET /api/v1/auth/yo` responde `200` con los datos del usuario. Con el `rol` se decide qué
pantallas mostrar.

```json
{
  "id": "01a14cc6-6e50-762a-b541-4f0b80289322",
  "correo": "e2e-tecnico@example.com",
  "nombre_completo": "Técnico E2E",
  "rol": "tecnico"
}
```

### 3.3 Renovar

```http
POST /api/v1/auth/renovar
Content-Type: application/json
X-Cliente: movil

{"refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOi…"}
```

Responde `200` con el mismo formato del inicio de sesión. **Guarde siempre el `refresh_token`
nuevo** y descarte el anterior.

Si responde `401` `"Sesión inválida o expirada"`, la sesión terminó: venció, pasaron 30 días, o
el agrónomo cambió la clave, el rol o el estado de la cuenta. Hay que volver al inicio de sesión
**sin perder las lecturas pendientes** (sección 5.4).

### 3.4 Ciclo recomendado

1. Haga la petición con el `access_token`.
2. Si responde `401`, renueve una sola vez y repita la petición con el acceso nuevo.
3. Si la renovación también responde `401`, pida iniciar sesión.

Un `401` puede traer `"Not authenticated"` (no se envió el token) o `"Sesión inválida o
expirada"` (token vencido o revocado). La app los trata igual.

Para cerrar sesión, la app borra sus tokens. `POST /auth/salir` solo borra la cookie del
navegador. Para cerrar todas las sesiones de una cuenta, el agrónomo le cambia la clave.

## 4. Sincronizar los datos para trabajar sin conexión

```http
GET /api/v1/sync/cambios?desde=2026-10-18T11:56:40.894011-05:00
Authorization: Bearer <access_token>
```

El servicio devuelve lo que la app necesita para trabajar sin señal: predios, lotes, trampas,
rutas, actividades del plan (del año en curso en adelante) y lecturas de los últimos 60 días.
Cada entidad trae tres listas:

- `creados`: registros nuevos para la app.
- `modificados`: registros que la app ya tenía y cambiaron.
- `borrados`: ids que la app debe descartar.

Los registros usan los mismos esquemas de sus endpoints (`TrampaLeer`, `LecturaLeer`…).

**Primera vez, o para recargar todo.** Omita `desde`. Llega todo en `creados` y nada en
`borrados`.

**Las siguientes veces.** Envíe como `desde` el `siguiente_desde` de la respuesta anterior:

```json
{
  "desde": "2026-10-18T16:59:41.203213Z",
  "servidor_en": "2026-10-18T12:01:41.204927-05:00",
  "siguiente_desde": "2026-10-18T11:56:41.204927-05:00",
  "predios":     {"creados": [], "modificados": [], "borrados": []},
  "lotes":       {"creados": [], "modificados": [], "borrados": []},
  "trampas":     {"creados": [], "modificados": [], "borrados": []},
  "rutas":       {"creados": [], "modificados": [], "borrados": []},
  "actividades": {"creados": [], "modificados": [], "borrados": []},
  "lecturas": {
    "creados": [
      {"id": "4c867560-8828-44db-a9ca-2a7f488e14a6", "trampa_codigo_ica": "FM-1018-1",
       "estado": "registrada", "dias_exposicion": 7, "…": "…"}
    ],
    "modificados": [],
    "borrados": []
  }
}
```

Reglas para aplicar la respuesta:

- **Guarde todo como upsert por `id`.** `siguiente_desde` es unos minutos anterior a
  `servidor_en` a propósito. Ese traslape evita perder cambios que se confirmaron mientras se
  hacía la consulta, así que pueden llegar registros que la app ya tenía.
- **Borrar en cascada.** Si un predio llega en `predios.borrados`, porque se borró o porque se
  lo quitaron al usuario, descarte todo su contenido. Un lote borrado se lleva sus trampas, su
  ruta y sus actividades.
- **Predio recién asignado.** Llega completo en `creados`, aunque sus datos sean viejos.
- **Semana en curso.** Las actividades de esta semana llegan siempre, porque su `estado` y su
  `avance` se calculan con las lecturas.
- **Errores.** `desde` sin zona horaria, o en el futuro, responde `422`. Si se perdió la fecha,
  haga la carga completa.

Sincronice al abrir la app con conexión y después de enviar lecturas.

## 5. Resolver el QR de una trampa y registrar la lectura

### 5.1 Del QR al código

La etiqueta de cada trampa codifica una URL corta: `<dominio>/t/<código>`, por ejemplo
`https://<dominio>/t/B3YDNNVP`. El código tiene 8 caracteres, letras mayúsculas y dígitos sin
los que se confunden (sin `0`, `O`, `1`, `I` ni `L`). Las mayúsculas no importan, y debajo del QR va
impreso para escribirlo a mano.

La app toma lo que va después de `/t/`:

- **Sin conexión:** busca la trampa sincronizada con ese `codigo_qr`.
- **Con conexión:** la resuelve en el servidor, que además trae su ruta y su última lectura.

```http
GET /api/v1/trampas/qr/b3ydnnvp
Authorization: Bearer <access_token>
```

```json
{
  "trampa": {
    "id": "01a14fec-95ca-7ca5-b9e8-c3eef3682be9",
    "lote_id": "01a14fec-9597-7180-8ce9-44b9470b66f6",
    "codigo_ica": "FM-1018-1",
    "codigo_qr": "B3YDNNVP",
    "tipo": "jackson",
    "atrayente": "Trimedlure",
    "fecha_instalacion": "2026-10-11",
    "estado": "activa",
    "geom": {"type": "Point", "coordinates": [-72.6405, 7.2711]},
    "precision_m": null,
    "created_at": "2026-10-18T11:51:07.335171-05:00",
    "updated_at": "2026-10-18T11:51:07.335171-05:00"
  },
  "lote": {
    "id": "01a14fec-9597-7180-8ce9-44b9470b66f6",
    "predio_id": "01a14fec-94eb-79e3-bffb-cab20b303c2b",
    "codigo": "FM-01",
    "nombre": null
  },
  "ruta": null,
  "ultima_lectura": null
}
```

| Respuesta | Qué mostrar |
|---|---|
| `200` con `trampa.estado` `retirada` o `inactiva` | La ficha, con el aviso de que no se registran lecturas. Solo se aceptan en trampas `activa`. |
| `404` `"No hay ninguna trampa con el código QR ZZZZ2345"` | Que el código no existe o no es de sus predios, y ofrecer escribirlo a mano. |
| `410` `"La etiqueta … fue reemplazada el …: use la etiqueta nueva de la trampa …"` | El mensaje tal cual: la etiqueta vieja sigue pegada en campo. |

`ruta` dice en qué parada va la trampa (`orden` de `total`) y el código ICA de la siguiente, para
guiar el recorrido.

### 5.2 Preparar el formulario

```http
GET /api/v1/visitas/lecturas/preparar?trampa_id=01a14fec-95ca-7ca5-b9e8-c3eef3682be9
```

```json
{
  "trampa_id": "01a14fec-95ca-7ca5-b9e8-c3eef3682be9",
  "revision_anterior": "2026-10-11",
  "dias_exposicion": 7,
  "ultima_lectura": null
}
```

Sin conexión, la app calcula los días de exposición. Son los días desde la última lectura no
rechazada de la trampa (o desde su instalación) hasta el día de la observación. El servidor los
vuelve a calcular al recibir la lectura.

### 5.3 Campos de la lectura

| Campo | Obligatorio | Regla |
|---|---|---|
| `id` | Sí | UUID generado en el teléfono al guardar el formulario. Nunca cambia, aunque se reenvíe. |
| `trampa_id` | Sí | Trampa `activa` de un predio asignado. |
| `observado_en` | Sí | Momento en campo, con zona. No puede pasar de 5 minutos en el futuro, tener más de 30 días, ni ser anterior a la instalación. |
| `capitata_machos`, `capitata_hembras` | Sí | *Ceratitis capitata*; enteros de 0 a 10 000. |
| `anastrepha` | Sí | *Anastrepha* spp.; entero de 0 a 10 000. |
| `estado_trampa` | Sí | `buena`, `danada`, `faltante` o `reubicada`. |
| `cambio_atrayente` | Sí | `true` si se cambió el atrayente en esta visita. |
| `dias_exposicion` | No | Si se omite, se usan los calculados. Si difiere de ellos, exige `justificacion_dias` (hasta 300 caracteres). |
| `observaciones` | No | Hasta 500 caracteres. |
| `posicion` y `precision_m` | No, pero van juntas | Ubicación del teléfono (`Point` en `[longitud, latitud]`) y su precisión en metros. El servidor calcula la distancia a la trampa. Si falta la ubicación o la lectura se tomó a más de 50 m, el agrónomo lo verá como aviso al validar. |

Solo hay una lectura por trampa y día, de cualquier técnico. Si el agrónomo rechaza una, se
puede registrar otra ese día.

### 5.4 Enviar las lecturas

La app guarda cada lectura en una cola local y la envía cuando hay conexión. Se recomienda el
envío en bloque, de hasta 200 lecturas por petición:

```http
POST /api/v1/sync/lecturas
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "lecturas": [
    {
      "id": "4c867560-8828-44db-a9ca-2a7f488e14a6",
      "trampa_id": "01a14fec-95ca-7ca5-b9e8-c3eef3682be9",
      "observado_en": "2026-10-18T12:01:41-05:00",
      "capitata_machos": 2,
      "capitata_hembras": 1,
      "anastrepha": 0,
      "estado_trampa": "buena",
      "cambio_atrayente": false,
      "observaciones": "Frutos caídos cerca",
      "posicion": {"type": "Point", "coordinates": [-72.64048, 7.2711]},
      "precision_m": 6
    }
  ]
}
```

El servidor procesa las lecturas en orden de `observado_en`, así los días de exposición salen
bien aunque lleguen desordenadas. Una que falle no impide guardar las demás. Responde `200`
con un resultado por lectura, en el mismo orden del envío. Este ejemplo reenvía la lectura
anterior y agrega otra de la misma trampa y el mismo día:

```json
{
  "resultados": [
    {
      "id": "4c867560-8828-44db-a9ca-2a7f488e14a6",
      "resultado": "existente",
      "codigo": 200,
      "detalle": null,
      "lectura": {
        "id": "4c867560-8828-44db-a9ca-2a7f488e14a6",
        "trampa_codigo_ica": "FM-1018-1",
        "lote_codigo": "FM-01",
        "dias_exposicion": 7,
        "dias_calculados": 7,
        "estado": "registrada",
        "distancia_m": 2.2,
        "avisos": [],
        "…": "…"
      }
    },
    {
      "id": "f4ea1b9a-cb9c-4da4-84bb-bcca605e05f4",
      "resultado": "error",
      "codigo": 409,
      "detalle": "Ya hay una lectura de FM-1018-1 del 18/10/2026",
      "lectura": null
    }
  ]
}
```

Qué hace la app con cada resultado:

| `resultado` | `codigo` | Acción |
|---|---|---|
| `creada` | 201 | Sacarla de la cola y reemplazar la copia local por `lectura`, que trae los días calculados, la distancia y el estado. |
| `existente` | 200 | Ya estaba guardada (un envío anterior llegó, pero la respuesta no). Hacer lo mismo que con `creada`. Si el reenvío traía otros datos con el mismo `id`, **vale la primera versión**: las lecturas no se editan desde la app, y la del servidor puede venir ya `validada` o `rechazada`. |
| `error` | 404 | La trampa ya no existe o no es de sus predios. Mostrar `detalle` y dejar que el técnico la descarte. |
| `error` | 409 | Otra lectura ocupa esa trampa ese día, o el `id` ya se usó en otra lectura. Mostrar `detalle`; reenviarla no cambia el resultado. |
| `error` | 422 | Una regla del dominio (fecha, trampa no activa, días sin justificación). Corregir el formulario y reenviarla. |

Si la petición entera falla (sin red, tiempo agotado o `5xx`), **reenvíe el mismo bloque**: los
`id` evitan duplicados. Si responde `401`, renueve la sesión (sección 3.4) y reenvíe; la cola
local se conserva.

Para una sola lectura con conexión también existe `POST /api/v1/visitas/lecturas`, con las
mismas reglas. Responde `201` al crearla, `200` si el `id` ya existía, o el error directamente.

## 6. Consultar el MTD

```http
GET /api/v1/mtd?predio_id=<id>&desde=2026-10-12&hasta=2026-10-18&especie=capitata
```

MTD = M ÷ (T × D), por especie y semana ISO, consolidado del predio:

- **M:** moscas capturadas.
- **T:** trampas revisadas.
- **D:** días promedio de exposición.

*C. capitata* se cuenta con las trampas Jackson y *Anastrepha* con las McPhail. `mtd` es `null`
cuando T × D = 0: muéstrelo como «sin dato», nunca como cero. Con una lectura de 3 moscas en una
trampa expuesta 7 días: M = 3, T = 1, D = 7 y MTD = 0,4286.

## 7. Manejo de errores

Todos los errores traen `detail`:

- Errores de negocio y de permisos: un texto en español para mostrarlo tal cual.
- `422` por formato: una lista de Pydantic que indica el campo (`loc`). Con ella se marca el
  campo del formulario.

```json
{
  "detail": [
    {"type": "missing", "loc": ["body", "lecturas", 0, "estado_trampa"], "msg": "Field required"}
  ]
}
```

| Código | Significado | Qué hacer |
|---|---|---|
| `401` | Sin sesión, o sesión vencida o revocada | Renovar una vez y, si falla, iniciar sesión (sección 3.4). |
| `403` | El rol no permite la acción (el productor no registra lecturas) | Ocultar la acción para ese rol. |
| `404` | No existe, o es de un predio no asignado | Mostrar `detail`. |
| `409` | Conflicto: id en uso, o la lectura del día ya existe | Mostrar `detail`; reintentar no lo resuelve. |
| `410` | Etiqueta QR reemplazada | Mostrar `detail`. |
| `422` | Datos inválidos | Corregir: texto con una regla del dominio, o lista con el campo. |
| `429` | Demasiados intentos de inicio de sesión | Esperar `Retry-After` segundos. |
| `5xx` o sin red | Falla del servidor o de la conexión | Conservar la cola y reintentar con espera creciente. Gracias a los `id`, reintentar es seguro. |

## 8. Datos personales (Ley 1581 de 2012)

- **Productor:** recibe en `null` el responsable de las lecturas (`responsable_id`,
  `responsable_nombre`, `revisada_por`) y el de las actividades del plan.
- **Posición GPS de una lectura:** solo la reciben el agrónomo, el administrador y el técnico
  que la registró. Los demás la reciben en `null`.
- **En la app:** no guarde más de lo que llega, no envíe estos datos a servicios de terceros
  (analítica, reportes de fallos) y borre la base local al cerrar sesión.

## 9. Probar la integración

`backend/app/scripts/flujo_movil.py` recorre este mismo flujo contra un servidor y valida cada
respuesta contra el `openapi.json` que ese servidor publica. El flujo es: iniciar sesión →
sincronizar → resolver el QR → registrar y reenviar la lectura → consultar el MTD → renovar.

```bash
docker compose exec -e FLUJO_CORREO=<técnico de pruebas> -e FLUJO_CLAVE=<clave> api \
  python -m app.scripts.flujo_movil --url https://<dominio> --informe /tmp/flujo-movil.md
```

Registra una lectura real: úselo con un usuario y un predio de pruebas. El resultado de la
corrida local está en `docs/pruebas/flujo-movil-local-2026-10-18.md`.
