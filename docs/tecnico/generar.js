// Documento técnico de PERSICA (HU-02) en Word: arquitectura, diagramas UML, modelo de datos,
// servicios y despliegue. Se ejecuta con docs/tecnico/generar.sh, que prepara los diagramas (PNG),
// el modelo de datos (modelo.json) y las versiones instaladas (pip.json, npm.json).
const fs = require('fs')
const path = require('path')
const { AlignmentType, Paragraph, TextRun } = require('docx')

const { crear, VERDE } = require('../docx-comun')

const RAIZ = path.join(__dirname, '..', '..')
const BUILD = path.join(__dirname, 'build')
const IMG = process.env.TECNICO_IMG || path.join(BUILD, 'img')
const leer = (archivo) => JSON.parse(fs.readFileSync(archivo, 'utf8'))
const MODELO = leer(process.env.TECNICO_MODELO || path.join(BUILD, 'modelo.json'))
const OPENAPI = leer(path.join(RAIZ, 'backend', 'openapi.json'))
const PIP = Object.fromEntries(leer(path.join(BUILD, 'pip.json')).map((p) => [p.name.toLowerCase(), p.version]))
const NPM = leer(path.join(BUILD, 'npm.json')).dependencies
const VERSION = JSON.parse(fs.readFileSync(path.join(RAIZ, 'frontend', 'package.json'), 'utf8')).version

const { p, h1, h2, h3, vinetas, pasos, nota, codigo, figura, tabla, espacio, portada, indice, documento, guardar } =
  crear({ imagenes: IMG })

// Los identificadores con guion bajo van como código para que runs() no los tome por cursiva.
const literal = (texto) =>
  String(texto)
    .split(/(`[^`]+`)/)
    .map((t) => (t.startsWith('`') ? t : t.replace(/[A-Za-z0-9.]*_[A-Za-z0-9_.]*/g, (x) => `\`${x}\``)))
    .join('')

const pip = (nombre) => PIP[nombre] ?? '—'
const npm = (nombre) => NPM[nombre]?.version ?? '—'

// Variables de los .env de ejemplo: los nombres se leen del archivo (sin valores) y la
// descripción sale de esta tabla; una variable nueva sin descripción detiene la generación.
const DESCRIPCION_VARIABLES = {
  DOMINIO: 'Dominio o subdominio que apunta a la IP pública del servidor.',
  CORREO_LETSENCRYPT: 'Correo al que Let\'s Encrypt avisa de certificados por vencer.',
  HTTP_PUERTO: 'Puerto HTTP publicado por nginx (80).',
  HTTPS_PUERTO: 'Puerto HTTPS publicado por nginx (443).',
  POSTGRES_USER: 'Usuario de PostgreSQL. Si cambia, actualizar `db/pgadmin/servers.json` (desarrollo).',
  POSTGRES_PASSWORD: 'Contraseña de PostgreSQL.',
  POSTGRES_DB: 'Nombre de la base de datos.',
  POSTGRES_PORT_HOST: 'Puerto de PostgreSQL en el equipo (solo escucha en 127.0.0.1).',
  DIAS_RETENCION: 'Días que se conservan las copias diarias de la base.',
  NGINX_PORT: 'Puerto de nginx en el equipo (Swagger y clientes externos).',
  ENVIRONMENT: '`development`, `test` o `production`. Fuera de desarrollo exige claves fuertes y HTTPS.',
  SECRET_KEY: 'Clave para firmar los tokens. Se genera con `openssl rand -hex 32`.',
  CORS_ORIGINS: 'Orígenes del navegador autorizados a llamar la API, separados por comas.',
  QR_URL_BASE: 'Dirección pública del aplicativo; el QR codifica `<QR_URL_BASE>/t/<código>`. En producción, https.',
  TOKEN_MINUTOS: 'Duración del token de acceso (minutos).',
  RENOVACION_DIAS: 'Duración del token de renovación (días).',
  SESION_MAX_DIAS: 'Tope absoluto de la sesión aunque se renueve (días).',
  INTENTOS_MAXIMOS: 'Intentos fallidos de inicio de sesión permitidos dentro de la ventana.',
  INTENTOS_VENTANA_MINUTOS: 'Ventana del límite de intentos (minutos).',
  FRONTEND_PORT: 'Puerto de Vite en el equipo.',
  VITE_USE_POLLING: '`true` en Windows/macOS para que funcione la recarga en caliente en Docker.',
  E2E_CORREO: 'Correo del agrónomo que crea `app.scripts.sembrar_e2e` para las pruebas E2E.',
  E2E_TECNICO_CORREO: 'Correo del técnico de las pruebas E2E.',
  E2E_CLAVE: 'Contraseña de las cuentas E2E.',
  PGADMIN_PORT: 'Puerto de pgAdmin en el equipo.',
  PGADMIN_EMAIL: 'Correo de acceso a pgAdmin.',
  PGADMIN_PASSWORD: 'Contraseña de acceso a pgAdmin.',
  RED_INTERNA: 'Subred de la red interna de Docker (opcional; cambiarla solo si choca con otra red).',
  IP_NGINX: 'IP fija de nginx dentro de la red interna (opcional).',
}

function variables(archivo) {
  const nombres = fs
    .readFileSync(path.join(RAIZ, archivo), 'utf8')
    .split('\n')
    .map((linea) => linea.match(/^#?\s*([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter(Boolean)
  return nombres.map((nombre) => {
    if (!DESCRIPCION_VARIABLES[nombre]) throw new Error(`Variable sin descripción: ${nombre}`)
    return [`\`${nombre}\``, DESCRIPCION_VARIABLES[nombre]]
  })
}

// ============================ CONTENIDO ============================

const introduccion = [
  h1('1. Introducción'),
  h2('1.1 Propósito'),
  p(
    'Este documento describe cómo está construido **PERSICA**, el aplicativo web de trazabilidad geolocalizada del trampeo de moscas de la fruta en el cultivo de durazno: su arquitectura, los componentes del servidor y de la interfaz, el comportamiento del sistema en diagramas UML, el modelo de datos, los servicios que expone y las instrucciones para desplegarlo y operarlo.',
  ),
  h2('1.2 Alcance'),
  p(
    `Corresponde a la versión **${VERSION}** del aplicativo (tag \`v${VERSION}\` del repositorio). El modelo de datos, el diccionario de datos y la tabla de servicios se generan desde el código fuente, de modo que coinciden con esa versión. La app móvil (fase 2) queda fuera del alcance; este documento describe los servicios que consumirá.`,
  ),
  h2('1.3 Audiencia'),
  ...vinetas([
    'Desarrolladores que mantengan el aplicativo o construyan la app móvil.',
    'Administradores del servidor que lo desplieguen y operen.',
    'Director y jurados del trabajo de grado, como documento de diseño (HU-02).',
  ]),
  h2('1.4 Documentos relacionados'),
  ...tabla(
    ['Documento', 'Ubicación'],
    [
      ['Backlog: épicas, historias y criterios de aceptación', '`BACKLOG.md`'],
      ['Contrato OpenAPI de los servicios', '`backend/openapi.json` y `/api/v1/openapi.json`'],
      ['Guía de integración para la app móvil', '`docs/guia-integracion.md`'],
      ['Manual de usuario', '`docs/manual/` y `/manual-usuario.pdf`'],
      ['Protocolo, matriz e informe de pruebas', '`docs/pruebas/`'],
      ['Instrucciones para el desarrollo con IA', '`CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`'],
    ],
    [5200, 4160],
    { leyendaTabla: 'Documentos relacionados.' },
  ),
  h2('1.5 Glosario técnico'),
  ...tabla(
    ['Término', 'Significado'],
    [
      ['**MTD**', 'Índice moscas/trampa/día = M ÷ (T × D), según el Manual Técnico de Trampeo del ICA.'],
      ['**PostGIS**', 'Extensión geoespacial de PostgreSQL (geometrías, áreas y distancias geodésicas).'],
      ['**SRID 4326**', 'Sistema de referencia WGS 84 (latitud y longitud) usado en todas las geometrías.'],
      ['**GeoJSON**', 'Formato de intercambio de geometrías (RFC 7946), con posiciones [longitud, latitud].'],
      ['**SPA**', 'Aplicación de una sola página: el frontend React que corre en el navegador.'],
      ['**JWT**', 'Token firmado que identifica la sesión en cada petición a la API.'],
      ['**UUIDv7**', 'Identificador único ordenado por tiempo; lo puede generar el dispositivo sin conexión.'],
      ['**Borrado lógico**', 'Se marca `deleted_at` en lugar de eliminar la fila.'],
      ['**Semana ISO**', 'Semana del año (1 a 52 o 53), de lunes a domingo.'],
    ],
    [2200, 7160],
    { leyendaTabla: 'Glosario técnico.' },
  ),
]

const vision = [
  h1('2. Visión general'),
  h2('2.1 Problema y solución'),
  p(
    'El predio productor de durazno de la vereda Icota (Cácota, Norte de Santander) monitorea moscas de la fruta con trampas Jackson (trimedlure, _Ceratitis capitata_) y McPhail (proteína hidrolizada, _Anastrepha_ spp.), y debe reportar al ICA el índice MTD. Sin una herramienta, la ubicación de las trampas, las rutas de revisión, la planeación semanal y el cálculo del índice se llevan en papel y hojas de cálculo.',
  ),
  p(
    'PERSICA georreferencia lotes y trampas, identifica cada trampa con un código QR que el técnico lee en campo, registra las lecturas con la posición del teléfono, planea las actividades de las 52 semanas, calcula el MTD por especie y genera el reporte para el ICA. Expone además una API documentada para la app móvil de la fase 2.',
  ),
  h2('2.2 Módulos'),
  ...tabla(
    ['Épica', 'Módulo', 'Funciones principales'],
    [
      ['E1', 'Fundación técnica y acceso', 'Entorno Docker, CI, inicio de sesión por rol, cuentas, varios predios, despliegue con HTTPS.'],
      ['E2', 'Lotes y trampas', 'Polígonos de lotes con área geodésica, trampas dentro de su lote, GPS, exportación GeoJSON/KML.'],
      ['E3', 'Códigos QR', 'Código corto por trampa, QR, etiquetas en PDF, ficha al escanear, reposición de etiquetas.'],
      ['E4', 'Mapa y rutas', 'Mapa con estado de monitoreo, rutas por vecino más cercano y avisos de revisión.'],
      ['E5', 'Planeación', 'Calendario de 52 semanas, reprogramación con motivo, cumplimiento y «Mi semana».'],
      ['E6', 'Lecturas y MTD', 'Formulario de lectura, validación, MTD por especie, reporte ICA, historial.'],
      ['E7', 'Servicios móviles', 'OpenAPI completo, sincronización de cambios y lecturas en bloque.'],
    ],
    [900, 2500, 5960],
    { leyendaTabla: 'Módulos del aplicativo por épica del backlog.' },
  ),
  h2('2.3 Roles'),
  ...tabla(
    ['Rol', 'Responsabilidad en el sistema'],
    [
      ['`tecnico`', 'Registra lecturas en campo y repone etiquetas; consulta su semana, el mapa y el MTD.'],
      ['`agronomo`', 'Gestiona lotes, trampas, rutas y plan; valida lecturas; descarga reportes. Solo en sus predios.'],
      ['`productor`', 'Consulta mapa, plan, MTD e historial, sin datos personales del personal.'],
      ['`administrador`', 'Lo del agrónomo en todos los predios; además crea predios, asigna personal y administra cuentas.'],
    ],
    [2000, 7360],
    { leyendaTabla: 'Roles y responsabilidades.' },
  ),
]

const arquitectura = [
  h1('3. Arquitectura'),
  h2('3.1 Estilo arquitectónico'),
  p(
    'PERSICA sigue una arquitectura **cliente-servidor en tres capas**: una SPA en React que corre en el navegador, una API REST en FastAPI que concentra las reglas de negocio y una base de datos PostgreSQL con PostGIS. Todo se empaqueta en contenedores Docker y se orquesta con Docker Compose, tanto en desarrollo como en producción. Un nginx publica el frontend compilado y hace de proxy de la API, termina TLS y aplica cabeceras de seguridad y límites de peticiones.',
  ),
  ...figura('componentes.png', 'Diagrama de componentes.', 4.3),
  p(
    'El frontend nunca usa direcciones absolutas: toda petición va a `/api/v1` en el mismo origen. En desarrollo la redirige Vite; en producción, nginx. La API no tiene puerto propio fuera de la red interna de Docker.',
  ),
  h2('3.2 Tecnologías'),
  ...tabla(
    ['Capa', 'Tecnología', 'Versión instalada', 'Uso'],
    [
      ['Base de datos', 'PostgreSQL + PostGIS', '18 · 3.6', 'Datos, geometrías (SRID 4326), UUIDv7 nativo'],
      ['API', 'Python', '3.13', 'Lenguaje del servidor'],
      ['API', 'FastAPI · uvicorn', `${pip('fastapi')} · ${pip('uvicorn')}`, 'API REST asíncrona y OpenAPI'],
      ['API', 'SQLAlchemy (async) · psycopg', `${pip('sqlalchemy')} · ${pip('psycopg')}`, 'ORM y controlador de PostgreSQL'],
      ['API', 'GeoAlchemy2 · Shapely', `${pip('geoalchemy2')} · ${pip('shapely')}`, 'Geometrías en el ORM y en Python'],
      ['API', 'Alembic', pip('alembic'), 'Migraciones del esquema'],
      ['API', 'Pydantic', pip('pydantic'), 'Validación de entradas y salidas'],
      ['API', 'PyJWT · pwdlib (Argon2)', `${pip('pyjwt')} · ${pip('pwdlib')}`, 'Tokens de sesión y contraseñas'],
      ['API', 'segno · reportlab', `${pip('segno')} · ${pip('reportlab')}`, 'Códigos QR y PDF (etiquetas, reporte MTD)'],
      ['Frontend', 'React · React Router', `${npm('react')} · ${npm('react-router')}`, 'Interfaz SPA y rutas'],
      ['Frontend', 'Vite', npm('vite'), 'Servidor de desarrollo y compilación'],
      ['Frontend', 'Leaflet · react-leaflet · Geoman', `${npm('leaflet')} · ${npm('react-leaflet')} · ${npm('@geoman-io/leaflet-geoman-free')}`, 'Mapas, dibujo y edición de polígonos'],
      ['Frontend', 'dnd-kit', npm('@dnd-kit/react'), 'Reordenar paradas de la ruta'],
      ['Pruebas', 'pytest · Vitest · Playwright', `${pip('pytest')} · ${npm('vitest')} · ${npm('@playwright/test')}`, 'API, componentes y extremo a extremo'],
      ['Calidad', 'ruff · oxlint', `${pip('ruff')} · ${npm('oxlint')}`, 'Linters y formato'],
      ['Infraestructura', 'Docker Compose · nginx · certbot', 'Compose v2 · 1.27 · 3.1', 'Contenedores, proxy TLS, Let\'s Encrypt'],
    ],
    [1500, 2900, 2000, 2960],
    { tamanoLetra: 17, leyendaTabla: 'Tecnologías y versiones instaladas.' },
  ),
  h2('3.3 Despliegue'),
  p('En desarrollo, Docker Compose levanta el frontend con recarga en caliente (Vite), la API con recarga automática, PostGIS, nginx, pgAdmin y, a pedido, el contenedor de pruebas E2E.'),
  ...figura('despliegue-desarrollo.png', 'Diagrama de despliegue en desarrollo.', 4.2),
  p(
    'En producción, una máquina virtual de Google Cloud ejecuta `docker-compose.prod.yml`: nginx con el frontend compilado y el certificado de Let\'s Encrypt, la API sin recarga y sin privilegios de root, PostGIS, el renovador de certificados y las copias diarias. La red interna de Docker aísla la base y la API; solo nginx publica los puertos 80 y 443. El capítulo 11 detalla el procedimiento.',
  ),
  ...figura('despliegue-produccion.png', 'Diagrama de despliegue en producción (Google Cloud).'),
  h2('3.4 Decisiones de diseño'),
  ...tabla(
    ['Decisión', 'Motivo'],
    [
      ['**Identificadores UUIDv7** que puede generar el cliente', 'La app móvil crea registros sin conexión; reenviar el mismo `id` no duplica (idempotencia).'],
      ['**Borrado lógico** (`deleted_at`) en todas las tablas', 'Conserva la trazabilidad y permite informar borrados al sincronizar.'],
      ['**SRID 4326** y validación espacial en el servidor', 'Una sola referencia (GPS); `ST_IsValid` y `ST_Contains` garantizan polígonos válidos y trampas dentro de su lote.'],
      ['**Área y distancias geodésicas** en PostGIS', 'Hectáreas y metros reales sobre el elipsoide, no en grados.'],
      ['**El QR solo lleva una URL corta** (`…/t/CÓDIGO`)', 'No expone datos; la trampa se puede mover o editar sin reimprimir la etiqueta.'],
      ['**Token de acceso en memoria + renovación en cookie HttpOnly**', 'Un script inyectado no puede robar la renovación; la sesión sobrevive a recargar la página.'],
      ['**Acceso por predio con respuesta 404**', 'Un usuario no puede ni confirmar que existe un recurso de otro predio.'],
      ['**MTD como función pura** (`services/mtd.py`)', 'Se prueba con casos calculados a mano, sin base de datos.'],
      ['**Estado calculado** de las actividades (cumplida, vencida)', 'Siempre coherente con las lecturas; no hay que mantener otro estado.'],
      ['**Mapa en canvas** (`preferCanvas`)', 'Chrome en macOS con GPU dejaba zonas sin pintar con la capa SVG de Leaflet.'],
      ['**Stack en una sola VM con Docker Compose**', 'El mismo stack de desarrollo; costo bajo y operación sencilla para un predio.'],
    ],
    [3800, 5560],
    { leyendaTabla: 'Decisiones de diseño.' },
  ),
]

const backend = [
  h1('4. Backend (API)'),
  h2('4.1 Estructura y capas'),
  p('El backend separa la entrada HTTP de las reglas de negocio:'),
  ...vinetas([
    '**Routers** (`app/api/v1/endpoints/`): un archivo por grupo de servicios. Validan la entrada con Pydantic, verifican sesión, rol y predio, llaman a los servicios y responden.',
    '**Dependencias** (`app/api/deps.py`, `app/api/acceso.py`): sesión de base de datos, usuario actual, `requiere_rol(...)` y `exigir_predio`, `exigir_lote`, `exigir_trampa`.',
    '**Servicios** (`app/services/`): lógica sin HTTP y, en lo posible, funciones puras (MTD, rutas, lecturas, QR, PDF, sincronización).',
    '**Modelos** (`app/models/`) y **esquemas** (`app/schemas/`): tablas ORM con GeoAlchemy2 y modelos Pydantic de entrada y salida.',
    '**Migraciones** (`migrations/`, Alembic): la API aplica `alembic upgrade head` al arrancar.',
  ]),
  ...figura('clases-backend.png', 'Backend por capas: routers, dependencias, servicios y modelos.'),
  h2('4.2 Autenticación y autorización'),
  ...vinetas([
    '`POST /auth/token` recibe correo y contraseña (formulario OAuth2) y devuelve un token de acceso JWT de **15 minutos**. La renovación (**7 días**, rotativa) va en la cookie `icota_renovacion` (`HttpOnly`, `Secure`, `SameSite=Strict`), o en el cuerpo si el cliente envía `X-Cliente: movil`. La sesión dura como máximo **30 días** desde el inicio.',
    'Contraseñas con **Argon2** (`pwdlib`); se rechazan las triviales (`services/claves.py`) y cambiar la propia exige la actual.',
    'Límite de intentos fallidos por correo e IP y por cuenta (`services/intentos.py`), además del `limit_req` de nginx en `/auth/token`.',
    '`UsuarioActualDep` decodifica el token y **recarga el usuario en cada petición**: activo, sin borrar y con el token emitido después de `sesion_valida_desde`, que sube al cambiar la clave, el rol o el estado (revoca las sesiones abiertas).',
    '`requiere_rol(...)` responde 403 por rol. `exigir_predio` y afines verifican que el recurso pertenezca a un predio asignado y responden **404** si no (el administrador ve todos).',
  ]),
  h2('4.3 Reglas geoespaciales'),
  ...vinetas([
    'Toda geometría usa **SRID 4326** y se intercambia en GeoJSON `[longitud, latitud]`. Un esquema rechaza coordenadas fuera de Colombia, lo que atrapa el error de invertir latitud y longitud.',
    'Lotes: `ST_IsValid` (sin autointersecciones) y área geodésica calculada por el servidor (`ST_Area` sobre `geography`). El traslape con otros lotes o la salida del límite del predio se guarda con advertencia.',
    'Trampas: `ST_Contains(lote.geom, trampa.geom)`; mover una trampa o cambiar la forma del lote no puede dejar trampas por fuera.',
    'Lecturas: distancia geodésica entre la posición del teléfono y la trampa (`ST_Distance` sobre `geography`); más de 50 m genera un aviso para el agrónomo.',
    'Rutas: matriz de distancias geodésicas y propuesta por **vecino más cercano** probando cada trampa como inicio (`services/rutas.py`).',
  ]),
  h2('4.4 Cálculo del MTD'),
  p('`services/mtd.py` implementa el índice como funciones puras:'),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 120 },
    children: [new TextRun({ text: 'MTD = M ÷ (T × D)', bold: true, size: 28, color: VERDE })],
  }),
  ...vinetas([
    '**M**: moscas de la especie (_C. capitata_ con trampas Jackson; _Anastrepha_ con McPhail; nunca se mezclan).',
    '**T**: trampas distintas revisadas en el periodo.',
    '**D**: días de exposición sumados ÷ T (si una trampa se lee dos veces, T × D son los trampa-días reales).',
    'Si T × D = 0 el MTD es `null` (sin dato): nunca se divide por cero.',
    'Se usan las lecturas vigentes y no rechazadas; se informa cuántas faltan por validar. Se consolida a nivel de predio por especie y semana ISO, también para las semanas sin lecturas.',
  ]),
  h2('4.5 Códigos QR y etiquetas'),
  ...vinetas([
    'Cada trampa recibe al crearse un **código de 8 caracteres** del alfabeto `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (sin 0, O, 1, I ni L), generado con `secrets` y único en el sistema. No cambia si la trampa se mueve.',
    'El QR (segno, **corrección de errores Q**) codifica solo `<QR_URL_BASE>/t/<código>`. Al leerlo se abre la ficha en el aplicativo; la API lo resuelve con `GET /trampas/qr/{codigo}`.',
    'Reemplazar una etiqueta genera un código nuevo y deja el anterior en `reemplazo_qr`: leerlo responde **410** indicando la etiqueta nueva.',
    'Las etiquetas se generan en PDF carta con 8 por hoja (reportlab), con QR de más de 3 cm, código ICA, lote, tipo y el código impreso para escribirlo a mano.',
  ]),
  h2('4.6 Sincronización (fase 2)'),
  ...vinetas([
    '`GET /sync/cambios?desde=` devuelve por entidad los registros creados, modificados y los ids borrados desde la fecha, con `siguiente_desde` y un traslape de 5 minutos (las transacciones fijan `updated_at` al inicio). Un predio recién asignado llega completo; uno desasignado, en borrados.',
    '`POST /sync/lecturas` registra hasta 200 lecturas en bloque, en orden de `observado_en`, con un punto de guardado por lectura: una que falla no impide las demás. Es idempotente por `id`.',
  ]),
  h2('4.7 Configuración'),
  p(
    'La configuración se lee de variables de entorno con pydantic-settings (`app/core/config.py`); el anexo A las lista. Fuera de desarrollo la API no arranca con una `SECRET_KEY` débil ni con un `QR_URL_BASE` sin HTTPS. La versión del aplicativo está en `app/core/version.py` y en `frontend/package.json`.',
  ),
]

const frontend = [
  h1('5. Frontend'),
  h2('5.1 Estructura'),
  ...vinetas([
    '`src/api/client.js`: único cliente HTTP. Agrega el token, renueva una vez ante un 401 y, si falla, cierra la sesión (evento `icota:sesion-cerrada`).',
    '`src/features/<módulo>/`: vistas, formularios y pruebas por módulo (auth, mapa, lotes, trampas, rutas, plan, lecturas, mtd, predio, predios, usuarios).',
    '`src/components/`: plantilla con el menú, encabezado, mapa base, modal de Ayuda.',
    '`src/utils/`: conversión GeoJSON ↔ Leaflet (`geo.js`, el único lugar donde se invierte el orden de coordenadas), fechas ISO en America/Bogota, formato y ubicación GPS.',
  ]),
  h2('5.2 Estado de la sesión y del predio'),
  ...vinetas([
    '`ProveedorSesion`: el token de acceso vive solo en memoria; al abrir la página se recupera con la cookie de renovación. `RutaProtegida` protege las vistas y recuerda la ruta pedida (p. ej. `/t/<código>`) para volver tras iniciar sesión.',
    '`ProveedorPredio`: lista de predios del usuario y predio actual, recordado en el navegador (`localStorage`). Las vistas por predio se vuelven a montar al cambiarlo.',
  ]),
  h2('5.3 Rutas de la interfaz'),
  ...tabla(
    ['Ruta', 'Vista', 'Acceso'],
    [
      ['`/`', 'Inicio de sesión', 'Público'],
      ['`/mapa`', 'Mapa del predio con indicadores y estado de monitoreo', 'Todos'],
      ['`/lotes`', 'Lotes: dibujar, editar, eliminar', 'Todos (edita agrónomo/administrador)'],
      ['`/trampas`', 'Trampas y QR, etiquetas', 'Todos (edita agrónomo/administrador)'],
      ['`/rutas`', 'Rutas de monitoreo', 'Todos (edita agrónomo/administrador)'],
      ['`/plan`', 'Calendario de 52 semanas y cumplimiento', 'Todos (edita agrónomo/administrador)'],
      ['`/mi-semana`', 'Actividades asignadas de la semana', 'Técnico y agrónomo'],
      ['`/lecturas`', 'Registrar lecturas y bandeja de validación', 'Técnico, agrónomo, administrador'],
      ['`/t/:codigo`, `/t/:codigo/lectura`', 'Ficha de la trampa al leer el QR y formulario de lectura', 'Todos (registra campo)'],
      ['`/mtd`, `/historial`', 'Índice MTD, reporte ICA e historial de capturas', 'Todos'],
      ['`/predio`', 'Datos y límite del predio; personal y todos los predios', 'Todos (administrador: personal y predios)'],
      ['`/usuarios`', 'Cuentas del personal', 'Administrador'],
    ],
    [2600, 4160, 2600],
    { tamanoLetra: 17, leyendaTabla: 'Rutas de la interfaz.' },
  ),
  h2('5.4 Mapas y uso en el teléfono'),
  ...vinetas([
    'react-leaflet con imágenes satelitales (ArcGIS) y de calles (OpenStreetMap); el dibujo y la edición de polígonos usan Leaflet-Geoman.',
    'Las capas se dibujan en **canvas** y los colores de lotes y límite se eligen por registro.',
    'El diseño es adaptable: en el teléfono el menú se pliega y las tablas se resumen. El GPS usa la Geolocation API en alta precisión, que exige HTTPS.',
  ]),
]

// --- Modelo de datos (generado) ---
function diccionario() {
  const bloques = []
  for (const t of MODELO.tablas) {
    bloques.push(h3(`Tabla ${t.nombre}`))
    if (t.descripcion) bloques.push(p(t.descripcion))
    bloques.push(
      ...tabla(
        ['Columna', 'Tipo', 'Nulo', 'Clave / referencia', 'Por defecto'],
        t.columnas.map((c) => [
          `\`${c.nombre}\``,
          c.tipo,
          c.nulo ? 'sí' : 'no',
          [c.pk ? 'PK' : '', c.fk ? `FK → ${c.fk}` : '', c.unico ? 'única' : ''].filter(Boolean).join(' · ') || '—',
          c.por_defecto ? literal(c.por_defecto) : '—',
        ]),
        [2200, 2300, 700, 2460, 1700],
        { tamanoLetra: 16, leyendaTabla: `Diccionario de datos de ${t.nombre}.` },
      ),
    )
    const extra = [
      ...t.indices
        .filter((i) => i.unico || i.donde)
        .map((i) => `Índice ${i.unico ? 'único ' : ''}\`${i.nombre}\` sobre (${literal(i.columnas.join(', '))})${i.donde ? ` donde ${literal(i.donde)}` : ''}.`),
      ...t.indices.filter((i) => !i.unico && !i.donde && i.nombre?.startsWith('idx_')).map((i) => `Índice espacial \`${i.nombre}\` (${literal(i.columnas.join(', '))}).`),
      ...t.checks.map(([nombre, expresion]) => `Restricción \`${nombre}\`: ${literal(expresion)}.`),
    ]
    if (extra.length) bloques.push(...vinetas(extra))
  }
  return bloques
}

const datos = [
  h1('6. Modelo de datos'),
  h2('6.1 Convenciones'),
  ...vinetas([
    'Todas las tablas heredan `EntidadSincronizable` (`app/db/base.py`): `id` UUIDv7 (por defecto `uuidv7()` de PostgreSQL 18, o enviado por el cliente), `created_at`, `updated_at` y `deleted_at` (borrado lógico). Las consultas filtran `deleted_at IS NULL`.',
    'Fechas en `timestamptz`; las lecturas guardan `observado_en` (momento en campo) además de `created_at` (llegada al servidor).',
    'Geometrías PostGIS con SRID 4326 e índice espacial; toda coordenada del GPS guarda su `precision_m`.',
    'Las unicidades que deben ignorar los registros borrados son **índices únicos parciales** (`WHERE deleted_at IS NULL`), p. ej. código de lote por predio o una lectura por trampa y día.',
    'Nombres de restricciones predecibles (`uq_`, `fk_`, `ck_`, `pk_`) para migraciones estables.',
  ]),
  h2('6.2 Modelo de dominio'),
  p('El diagrama de clases muestra las entidades, sus atributos principales y las relaciones con su multiplicidad.'),
  ...figura('clases-dominio.png', 'Modelo de dominio (diagrama de clases).'),
  h2('6.3 Modelo entidad-relación'),
  p(
    `El modelo físico tiene ${MODELO.tablas.length} tablas. Por legibilidad se presenta en dos áreas; las tablas en gris pertenecen a la otra área. Un asterisco indica columna obligatoria; las columnas comunes se resumen al pie de cada entidad.`,
  ),
  ...figura('er-predio.png', 'Modelo entidad-relación: predio, lotes, trampas y rutas.'),
  ...figura('er-operacion.png', 'Modelo entidad-relación: visitas, lecturas y plan de actividades.'),
  h2('6.4 Diccionario de datos'),
  p('Generado desde los modelos ORM. «PK» es llave primaria, «FK» llave foránea.'),
  ...diccionario(),
]

const comportamiento = [
  h1('7. Comportamiento del sistema (UML)'),
  h2('7.1 Casos de uso'),
  p(
    'Los actores son los cuatro roles y la app móvil de la fase 2. El administrador hereda los casos de uso del agrónomo. «Leer el QR» extiende el registro de la lectura, que incluye haber iniciado sesión.',
  ),
  ...figura('casos-uso-campo.png', 'Casos de uso de campo y consulta.', 4.6),
  ...figura('casos-uso-gestion.png', 'Casos de uso de gestión del predio y administración.', 3.8),
  h2('7.2 Secuencia: inicio de sesión y renovación'),
  p('Muestra los límites de intentos, la emisión de los dos tokens y cómo el cliente renueva el acceso de forma transparente cuando vence.'),
  ...figura('secuencia-sesion.png', 'Inicio de sesión y renovación del token.'),
  h2('7.3 Secuencia: leer el QR y registrar la lectura'),
  p('Es el flujo central del trabajo de campo: la cámara abre la ficha de la trampa, el formulario calcula los días de exposición y el servidor valida, ubica y guarda la lectura en la visita del día.'),
  ...figura('secuencia-lectura-qr.png', 'Leer el QR de una trampa y registrar la lectura.'),
  h2('7.4 Secuencia: validar o rechazar una lectura'),
  ...figura('secuencia-validacion.png', 'Validar o rechazar una lectura.'),
  h2('7.5 Secuencia: sincronización móvil'),
  ...figura('secuencia-sincronizacion.png', 'Sincronización de la app móvil.'),
  h2('7.6 Secuencia: cálculo del MTD y reporte'),
  ...figura('secuencia-mtd.png', 'Cálculo del MTD y reporte para el ICA.'),
  h2('7.7 Actividad: ciclo semanal de monitoreo'),
  p('Integra los módulos: el plan genera las visitas, el técnico recorre la ruta leyendo las trampas, el agrónomo valida y el MTD orienta la reprogramación y el reporte.'),
  ...figura('actividad-monitoreo.png', 'Ciclo semanal de monitoreo.', 5.4),
  h2('7.8 Estados'),
  p('Las lecturas, las actividades del plan y las trampas tienen ciclos de vida explícitos. «Cumplida» y «vencida» de una actividad se calculan al consultarla a partir de las lecturas de su semana.'),
  ...figura('estados.png', 'Estados de la lectura, la actividad del plan y la trampa.'),
]

// --- Servicios (generado desde openapi.json) ---
function servicios() {
  const grupos = {}
  for (const [ruta, operaciones] of Object.entries(OPENAPI.paths)) {
    for (const [metodo, op] of Object.entries(operaciones)) {
      const grupo = op.tags?.[0] ?? 'otros'
      ;(grupos[grupo] ||= []).push([metodo.toUpperCase(), `\`${ruta.replace('/api/v1', '')}\``, op.summary ?? ''])
    }
  }
  const total = Object.values(grupos).reduce((n, filas) => n + filas.length, 0)
  return {
    total,
    bloques: Object.entries(grupos).flatMap(([grupo, filas]) => [
      h3(`Grupo ${grupo}`),
      ...tabla(['Método', 'Ruta', 'Resumen'], filas, [1000, 4000, 4360], { tamanoLetra: 16, leyendaTabla: `Servicios del grupo ${grupo}.` }),
    ]),
  }
}
const API = servicios()

const apiDoc = [
  h1('8. Servicios (API REST)'),
  h2('8.1 Convenciones'),
  ...vinetas([
    'Base `/api/v1`; JSON en UTF-8; autenticación `Authorization: Bearer <token>`.',
    'Errores con cuerpo `{"detail": "..."}` en español; 422 de validación con la lista de Pydantic. Códigos usados: 401, 403, 404, 409, 410, 422 y 429.',
    'Los recursos que crea el cliente aceptan su `id`; reenviarlo devuelve 200 con el registro existente (idempotencia).',
    `El contrato completo, con ejemplos y errores de cada operación, está en \`backend/openapi.json\` (versionado; una prueba falla si se desactualiza) y en \`/api/v1/openapi.json\`. La guía \`docs/guia-integracion.md\` explica los flujos para la app móvil.`,
  ]),
  h2('8.2 Operaciones'),
  p(`La API publica **${API.total} operaciones** en ${Object.keys(OPENAPI.paths).length} rutas, agrupadas por etiqueta.`),
  ...API.bloques,
]

const seguridad = [
  h1('9. Seguridad y datos personales'),
  ...tabla(
    ['Riesgo', 'Control'],
    [
      ['Robo de sesión por XSS', 'Acceso solo en memoria; renovación en cookie HttpOnly, Secure, SameSite=Strict; CSP estricta en nginx.'],
      ['Fuerza bruta y rociado de contraseñas', 'Argon2; límite por correo e IP y por cuenta; `limit_req` por IP en nginx; mensaje genérico.'],
      ['Sesiones que sobreviven a un cambio de permisos', '`sesion_valida_desde` revoca al cambiar clave, rol o estado; tope de 30 días.'],
      ['Acceso a datos de otro predio', '`exigir_predio`/`lote`/`trampa` en cada recurso; 404 sin revelar existencia.'],
      ['Asignación masiva de campos privilegiados', 'Los esquemas de entrada no incluyen campos privilegiados; `rol` y `activo` solo se aceptan en los servicios de cuentas del administrador y `deleted_at` nunca.'],
      ['Inyección SQL', 'Siempre consultas parametrizadas (SQLAlchemy).'],
      ['Inyección de fórmulas en CSV y de marcado en PDF', 'Celdas que empiezan con = + - @ se neutralizan; textos escapados en reportlab.'],
      ['Peticiones desde otros sitios', 'CORS restringido y rechazo de `Origin` ajeno en escrituras.'],
      ['Exposición de la infraestructura', 'Base y API solo en la red interna; HSTS, X-Frame-Options, nosniff; Swagger apagado en producción.'],
      ['Secretos en el código', '`.env` fuera de Git; claves generadas en el servidor; gitleaks en la CI.'],
      ['Dependencias vulnerables', 'pip-audit y npm audit en cada ejecución de la CI.'],
    ],
    [3300, 6060],
    { leyendaTabla: 'Riesgos y controles de seguridad.' },
  ),
  p(
    '**Ley 1581 de 2012.** Al crear una cuenta se registra la autorización del titular. El productor no recibe quién registró una lectura ni quién es responsable de una actividad; la posición GPS de una lectura solo la ven el agrónomo, el administrador y el técnico que la tomó. Los reportes CSV y PDF no incluyen datos personales. Las cuentas no se eliminan: se desactivan, para conservar la autoría.',
  ),
]

const calidad = [
  h1('10. Calidad y pruebas'),
  ...vinetas([
    '**API (pytest):** sobre PostgreSQL/PostGIS real, cada prueba en una transacción que se revierte. Cubre reglas, permisos (401/403/404), idempotencia, borrado lógico, validaciones espaciales y el MTD con casos calculados a mano.',
    '**Interfaz (Vitest + Testing Library):** componentes con la API simulada, consultando como usuario (roles y textos en español).',
    '**Extremo a extremo (Playwright):** flujos completos con perfil de teléfono Android (Pixel 7) sobre el stack de Docker.',
    '**Flujo móvil:** `app.scripts.flujo_movil` recorre el flujo de la app contra un servidor y valida cada respuesta con el `openapi.json` publicado.',
    '**Trazabilidad:** 110 casos de prueba trazados a los criterios de aceptación (`docs/pruebas/`).',
  ]),
  ...figura('actividad-ci.png', 'Integración continua (GitHub Actions) y entrega.', 3.9),
]

const despliegue = [
  h1('11. Despliegue y operación'),
  h2('11.1 Requisitos'),
  ...vinetas([
    '**Desarrollo:** Docker Desktop (o Docker Engine con Compose v2) y Git. No se necesita Python ni Node en el equipo.',
    '**Producción:** una VM Linux con 2 GB de RAM (e2-small), 20 GB de disco, IP pública fija, un dominio o subdominio y los puertos 80 y 443 abiertos.',
    '**Google Cloud:** proyecto con facturación activa y la CLI `gcloud` (con Python 3.10 o superior).',
  ]),
  h2('11.2 Entorno de desarrollo'),
  ...pasos([
    'Clonar el repositorio y copiar las variables: `cp .env.example .env` (ajustar claves).',
    'Levantar el stack: `docker compose up -d --build`. La API aplica las migraciones al arrancar.',
    'Abrir http://localhost:5173 (aplicativo), http://localhost/docs (Swagger) y http://localhost:5050 (pgAdmin).',
    'Crear la primera cuenta: `docker compose exec api python -m app.scripts.crear_usuario --correo <correo> --nombre "<nombre>" --rol administrador` (pide la contraseña).',
    'Pruebas: `docker compose exec api pytest`, `docker compose exec frontend npm test` y, para E2E, `docker compose exec api python -m app.scripts.sembrar_e2e` seguido de `docker compose --profile e2e run --rm e2e`.',
  ]),
  h2('11.3 Producción en Google Cloud'),
  p('El despliegue actual: proyecto `persica-iser`, VM `persica` (e2-small, Debian 12, `us-east1-b`), IP fija 34.138.170.192 y https://persica.redsoftdevelopers.com.'),
  h3('Paso 1. Infraestructura'),
  p('Crea la IP fija, la VM, la regla de firewall para los puertos 80 y 443 y los snapshots diarios del disco (7 días). Es idempotente.'),
  ...codigo('gcloud auth login\nPROYECTO=persica-iser sh deploy/gcp/crear-infraestructura.sh'),
  h3('Paso 2. DNS'),
  p('En el proveedor del dominio, crear el registro **A** del subdominio con la IP que muestra el paso 1 (TTL 300) y verificar que resuelva:'),
  ...codigo('dig +short persica.redsoftdevelopers.com'),
  h3('Paso 3. Servidor y aplicativo'),
  p('Instala Docker y Compose, agrega swap, descarga la versión indicada en `/opt/persica`, crea `.env` con claves aleatorias generadas en el servidor (permisos 600) y levanta el stack:'),
  ...codigo(
    'gcloud compute ssh persica --project persica-iser --zone us-east1-b --command \\\n  "DOMINIO=persica.redsoftdevelopers.com CORREO=<correo> VERSION=v1.0.0 sh -s" \\\n  < deploy/gcp/instalar-servidor.sh',
  ),
  h3('Paso 4. Certificado HTTPS'),
  p('Con el DNS resolviendo, se emite primero con el entorno de pruebas de Let\'s Encrypt y luego el definitivo. El servicio certbot lo renueva cada 12 horas.'),
  ...codigo(
    'gcloud compute ssh persica --project persica-iser --zone us-east1-b\n# ya en el servidor:\ncd /opt/persica\nsudo STAGING=1 sh deploy/obtener-certificado.sh\n# si sale bien, borrar el de prueba y emitir el definitivo:\nsudo docker compose -f docker-compose.prod.yml run --rm \\\n  --entrypoint certbot certbot delete --cert-name persica.redsoftdevelopers.com\nsudo sh deploy/obtener-certificado.sh',
  ),
  h3('Paso 5. Primer administrador y datos de demostración'),
  p('Crear la cuenta desde una terminal interactiva (pide la contraseña) y, si se quiere, sembrar el predio de demostración con cuentas ficticias que toman la misma contraseña:'),
  ...codigo(
    'gcloud compute ssh persica --project persica-iser --zone us-east1-b -- -t \\\n  "cd /opt/persica && sudo docker compose -f docker-compose.prod.yml exec api \\\n   python -m app.scripts.crear_usuario --correo <correo> --nombre \'<nombre>\' --rol administrador"\n\ngcloud compute ssh persica --project persica-iser --zone us-east1-b --command \\\n  "cd /opt/persica && sudo docker compose -f docker-compose.prod.yml exec -T \\\n   -e ADMIN_CORREO=<correo> api python -" < backend/app/scripts/sembrar_demostracion.py',
  ),
  h3('Paso 6. Verificación'),
  ...codigo(
    '# 200 y cabeceras HSTS y CSP:\ncurl -sI https://persica.redsoftdevelopers.com | head -5\n# versión, base de datos y PostGIS:\ncurl -s https://persica.redsoftdevelopers.com/api/v1/health',
  ),
  h2('11.4 Actualizar a una versión nueva'),
  ...pasos([
    'Integrar los cambios en `main` con la CI en verde y crear el tag: `git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`. Subir antes la versión en `frontend/package.json` y `backend/app/core/version.py`.',
    'Ejecutar de nuevo `deploy/gcp/instalar-servidor.sh` con `VERSION=vX.Y.Z`: conserva `.env`, cambia al tag y reconstruye; la API aplica las migraciones al arrancar.',
    'Verificar con `/api/v1/health` que responda la versión nueva.',
  ]),
  nota('Nunca ejecute `docker compose down -v` en el servidor: borra el volumen de la base de datos.', 'Importante'),
  h2('11.5 Respaldos y restauración'),
  ...vinetas([
    'El servicio `respaldo` hace un `pg_dump` diario a las 02:00 (Bogotá) y conserva 14 días en el volumen `respaldos`.',
    'Google Cloud guarda un snapshot diario del disco completo durante 7 días.',
    'Prueba de restauración (restaura la última copia en una base temporal y compara conteos):',
  ]),
  ...codigo('cd /opt/persica && sudo docker compose -f docker-compose.prod.yml exec respaldo sh /respaldo/probar-restauracion.sh'),
  p('Restaurar una copia sobre la base en uso: `deploy/respaldo/restaurar.sh` (detiene la API mientras restaura).'),
  h2('11.6 Registros y diagnóstico'),
  ...codigo(
    'cd /opt/persica\nsudo docker compose -f docker-compose.prod.yml ps\nsudo docker compose -f docker-compose.prod.yml logs --tail=200 api nginx\nsudo docker compose -f docker-compose.prod.yml exec db psql -U icota -d durazno_icota',
  ),
  ...tabla(
    ['Síntoma', 'Causa probable y solución'],
    [
      ['El navegador avisa que el certificado no es válido', 'Certificado provisional: emitir con `obtener-certificado.sh` cuando el DNS resuelva.'],
      ['502 Bad Gateway', 'La API no arrancó: revisar `logs api` (migración o variable de entorno).'],
      ['La API no arranca por `SECRET_KEY` débil o `QR_URL_BASE` sin https', 'Revisar `.env`: clave de 32 bytes y URL con https.'],
      ['El teléfono no comparte la ubicación', 'Debe abrirse por https:// y con el permiso de ubicación concedido.'],
      ['Sin espacio en disco', '`docker system prune` (imágenes viejas) y revisar los respaldos.'],
    ],
    [3400, 5960],
    { leyendaTabla: 'Problemas frecuentes en producción.' },
  ),
  h2('11.7 Costos'),
  p('Con la configuración actual, del orden de **US$15 al mes**: VM e2-small (unos US$13), disco de 20 GB (unos US$2) y snapshots (centavos). La IP fija no se cobra mientras esté asignada a la VM encendida.'),
]

const anexos = [
  h1('Anexo A. Variables de entorno'),
  p('Valores de ejemplo en `.env.example` (desarrollo) y `.env.prod.example` (producción). En producción el archivo `.env` vive solo en el servidor.'),
  h2('A.1 Desarrollo (.env.example)'),
  ...tabla(['Variable', 'Descripción'], variables('.env.example'), [3000, 6360], { tamanoLetra: 17, leyendaTabla: 'Variables de entorno de desarrollo.' }),
  h2('A.2 Producción (.env.prod.example)'),
  ...tabla(['Variable', 'Descripción'], variables('.env.prod.example'), [3000, 6360], { tamanoLetra: 17, leyendaTabla: 'Variables de entorno de producción.' }),
  h1('Anexo B. Estructura del repositorio'),
  ...tabla(
    ['Carpeta', 'Contenido'],
    [
      ['`backend/app/`', 'API: `main.py`, `core/` (configuración y versión), `db/`, `api/` (dependencias y routers), `models/`, `schemas/`, `services/`, `scripts/`'],
      ['`backend/migrations/`', 'Migraciones de Alembic'],
      ['`backend/tests/`', 'Pruebas pytest'],
      ['`frontend/src/`', 'SPA: `api/`, `components/`, `features/<módulo>/`, `utils/`'],
      ['`frontend/e2e/`', 'Pruebas Playwright (y capturas del manual)'],
      ['`nginx/`', 'Configuración de desarrollo y de producción (`prod/`: TLS, seguridad, certificado)'],
      ['`deploy/`', 'Certificado, respaldos y despliegue en Google Cloud (`gcp/`)'],
      ['`db/init/`', 'Extensiones de PostgreSQL al crear el volumen'],
      ['`docs/`', 'Guía de integración, manual, pruebas y este documento'],
      ['`.github/workflows/`', 'Integración continua'],
    ],
    [2600, 6760],
    { tamanoLetra: 17, leyendaTabla: 'Estructura del repositorio.' },
  ),
  h1('Anexo C. Cómo regenerar este documento'),
  p('El modelo de datos, el diccionario, la tabla de servicios y las versiones se leen del código. Con el stack de desarrollo arriba:'),
  ...codigo('npm install --prefix /tmp/docx docx@9\nNODE_PATH=/tmp/docx/node_modules sh docs/tecnico/generar.sh'),
  p('Los diagramas UML están en `docs/tecnico/diagramas/*.puml` (PlantUML) y se renderizan con la imagen Docker `plantuml/plantuml`.'),
]

// ============================ DOCUMENTO ============================

const doc = documento({
  titulo: 'PERSICA · Documento técnico',
  descripcion: 'Arquitectura, diseño UML, modelo de datos y despliegue de PERSICA (HU-02)',
  encabezado: 'PERSICA · Documento técnico',
  contenido: [
    ...portada({
      logo: 'logo.png',
      titulo: 'Documento técnico',
      subtitulo: 'Arquitectura, diseño, modelo de datos y despliegue de PERSICA',
      lineas: ['Trazabilidad geolocalizada del trampeo de moscas de la fruta en el cultivo de durazno'],
      pie: [
        'Luis e Ingry · Trabajo de grado, Semillero ORION',
        'Instituto Superior de Educación Rural (ISER) · Pamplona, Norte de Santander',
        `Versión ${VERSION} · octubre de 2026`,
      ],
    }),
    ...indice(process.env.TECNICO_TOC),
    ...introduccion,
    ...vision,
    ...arquitectura,
    ...backend,
    ...frontend,
    ...datos,
    ...comportamiento,
    ...apiDoc,
    ...seguridad,
    ...calidad,
    ...despliegue,
    ...anexos,
  ],
})

guardar(doc, process.argv[2] || path.join(__dirname, 'Documento_tecnico_PERSICA.docx'), process.env.TECNICO_TITULOS)
