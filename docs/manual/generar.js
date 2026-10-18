// Genera el manual de usuario de PERSICA (HU-38.1) en Word a partir de las capturas.
//
// 1. Capturas: MANUAL=1 docker compose --profile e2e run --rm e2e npx playwright test manual
//    (quedan en frontend/test-results/manual/, junto con etiquetas.pdf y reporte-mtd.pdf).
// 2. Pasar las capturas a JPEG en docs/manual/img/ (1800 px de ancho las de escritorio, 900 las
//    del teléfono; las del teléfono más altas que 2,25 veces su ancho, en tramos -p1, -p2…), la
//    primera página de los PDF como 23-etiquetas-pdf(-recorte).jpg y 24-reporte-mtd-pdf.jpg, y el
//    logo (frontend/public/persica-logo.svg) como logo.png.
// 3. npm install docx@9 && node generar.js
const fs = require('fs')
const path = require('path')
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  VerticalAlign,
} = require('docx')

const IMG = path.join(__dirname, 'img')
const VERDE = '1F5A32'
const VERDE_CLARO = 'E8F1EA'
const DURAZNO = 'C4572E'
const ANCHO_PAGINA = 9360 // DXA: 6,5" de contenido en carta con márgenes de 1"

// --- Tamaño de las imágenes (JPEG y PNG) para conservar la proporción ---
function tamano(archivo) {
  const b = fs.readFileSync(archivo)
  if (b[0] === 0x89) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
  let i = 2
  while (i < b.length) {
    const marcador = b[i + 1]
    const largo = b.readUInt16BE(i + 2)
    if (marcador >= 0xc0 && marcador <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }
    i += 2 + largo
  }
  throw new Error(`Sin tamaño: ${archivo}`)
}

// --- Texto con **negrita** y _cursiva_ ---
function runs(texto, base = {}) {
  const partes = texto.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean)
  return partes.map((t) =>
    t.startsWith('**')
      ? new TextRun({ ...base, text: t.slice(2, -2), bold: true })
      : t.startsWith('_') && t.endsWith('_') && t.length > 2
        ? new TextRun({ ...base, text: t.slice(1, -1), italics: true })
        : new TextRun({ ...base, text: t }),
  )
}

const p = (texto, opciones = {}) =>
  new Paragraph({ children: runs(texto), spacing: { after: 120 }, ...opciones })
const h1 = (texto) =>
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(texto)] })
const h2 = (texto) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(texto)] })
const h3 = (texto) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(texto)] })
const vinetas = (items) =>
  items.map((t) => new Paragraph({ numbering: { reference: 'vinetas', level: 0 }, children: runs(t), spacing: { after: 60 } }))
let lista = 0
const pasos = (items) => {
  lista += 1
  return items.map(
    (t) =>
      new Paragraph({
        numbering: { reference: 'pasos', level: 0, instance: lista },
        children: runs(t),
        spacing: { after: 80 },
      }),
  )
}

// Recuadro de nota o advertencia (párrafo con borde izquierdo y fondo).
const nota = (texto, tipo = 'Nota') =>
  new Paragraph({
    children: [new TextRun({ text: `${tipo}: `, bold: true, color: tipo === 'Importante' ? DURAZNO : VERDE }), ...runs(texto)],
    shading: { type: ShadingType.CLEAR, fill: tipo === 'Importante' ? 'FCEDE6' : VERDE_CLARO, color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: tipo === 'Importante' ? DURAZNO : VERDE, space: 8 } },
    spacing: { before: 120, after: 160 },
    indent: { left: 160, right: 160 },
  })

let figuras = 0
const leyenda = (texto) => {
  figuras += 1
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [
      new TextRun({ text: `Figura ${figuras}. `, bold: true, size: 18, color: '555555' }),
      new TextRun({ text: texto, italics: true, size: 18, color: '555555' }),
    ],
  })
}

function imagen(archivo, anchoPulgadas) {
  const ruta = path.join(IMG, archivo)
  const { w, h } = tamano(ruta)
  const ancho = anchoPulgadas * 96
  return new ImageRun({
    type: archivo.endsWith('.png') ? 'png' : 'jpg',
    data: fs.readFileSync(ruta),
    transformation: { width: Math.round(ancho), height: Math.round((ancho * h) / w) },
    altText: { title: archivo, description: archivo, name: archivo },
  })
}

// Captura de escritorio a todo el ancho, con borde fino.
const figura = (archivo, texto, ancho = 6.5) => [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    spacing: { before: 120, after: 60 },
    children: [imagen(archivo, ancho)],
  }),
  leyenda(texto),
]

// Capturas de teléfono una al lado de la otra (una captura larga va en dos tramos).
function telefono(archivos, texto, ancho = 2.05) {
  const sinBorde = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const bordes = { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde, insideHorizontal: sinBorde, insideVertical: sinBorde }
  const col = Math.floor(ANCHO_PAGINA / archivos.length)
  return [
    new Table({
      width: { size: col * archivos.length, type: WidthType.DXA },
      columnWidths: archivos.map(() => col),
      borders: bordes,
      alignment: AlignmentType.CENTER,
      rows: [
        new TableRow({
          cantSplit: true,
          children: archivos.map(
            (a) =>
              new TableCell({
                width: { size: col, type: WidthType.DXA },
                borders: bordes,
                verticalAlign: VerticalAlign.TOP,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [imagen(a, ancho)] })],
              }),
          ),
        }),
      ],
    }),
    leyenda(texto),
  ]
}

function tabla(encabezados, filas, anchos) {
  const total = anchos.reduce((a, b) => a + b, 0)
  const borde = { style: BorderStyle.SINGLE, size: 4, color: 'BFCFC4' }
  const bordes = { top: borde, bottom: borde, left: borde, right: borde }
  const celda = (texto, i, cabecera) =>
    new TableCell({
      width: { size: anchos[i], type: WidthType.DXA },
      borders: bordes,
      shading: cabecera ? { type: ShadingType.CLEAR, fill: VERDE, color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [
        new Paragraph({
          children: cabecera ? [new TextRun({ text: texto, bold: true, color: 'FFFFFF', size: 19 })] : runs(texto, { size: 19 }),
        }),
      ],
    })
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: anchos,
    rows: [
      new TableRow({ tableHeader: true, children: encabezados.map((t, i) => celda(t, i, true)) }),
      ...filas.map((f) => new TableRow({ cantSplit: true, children: f.map((t, i) => celda(t, i, false)) })),
    ],
  })
}
const espacio = () => new Paragraph({ spacing: { after: 120 }, children: [] })

// ============================ CONTENIDO ============================

const portada = [
  new Paragraph({ spacing: { before: 1200 }, alignment: AlignmentType.CENTER, children: [imagen('logo.png', 2.6)] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text: 'Manual de usuario', bold: true, size: 56, color: VERDE })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [
      new TextRun({
        text: 'Trazabilidad geolocalizada del trampeo de moscas de la fruta en el cultivo de durazno',
        size: 26,
        color: '444444',
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Para el personal de campo, el agrónomo y el administrador', size: 22 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1600 },
    children: [new TextRun({ text: 'Vereda Icota · Cácota, Norte de Santander', size: 20, color: '555555' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: 'Instituto Superior de Educación Rural (ISER) · Semillero ORION',
        size: 20,
        color: '555555',
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Versión 1.0 · octubre de 2026', size: 20, color: '555555' })],
  }),
]

const indice = [
  new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: 'Contenido', bold: true, size: 32, color: VERDE })], spacing: { after: 240 } }),
  new TableOfContents('Contenido', { headingStyleRange: '1-2' }),
]

const introduccion = [
  h1('1. Introducción'),
  p(
    '**PERSICA** es el aplicativo web con el que el predio registra y georreferencia sus lotes y trampas, identifica cada trampa con un código QR, define las rutas de monitoreo, planea las actividades de las 52 semanas del año y calcula el índice **MTD** (moscas/trampa/día) según el Manual Técnico de Trampeo del ICA (Plan Nacional de Moscas de la Fruta).',
  ),
  p(
    'Este manual explica, paso a paso y con capturas de pantalla, todos los flujos del aplicativo. Está organizado por tareas: cada capítulo indica qué rol la realiza, dónde se encuentra en el menú y qué hacer si algo no sale como se espera.',
  ),
  h2('1.1 A quién va dirigido'),
  tabla(
    ['Perfil', 'Capítulos recomendados'],
    [
      ['**Técnico de campo**', '2, 3, 4 y 9 (trabajo de campo y lecturas con el teléfono)'],
      ['**Agrónomo**', 'Todos, en especial 5 a 8 (predio, lotes, trampas, rutas, planeación), 10 (validación) y 11 (MTD)'],
      ['**Productor**', '2, 3, 4 y 11 (consulta del mapa, del plan y del MTD)'],
      ['**Administrador**', 'Todos, en especial 12 (predios y cuentas)'],
    ],
    [2600, 6760],
  ),
  espacio(),
  h2('1.2 Convenciones del manual'),
  ...vinetas([
    'Los nombres de botones, campos y opciones del menú se escriben en **negrita**, tal como aparecen en la pantalla.',
    'Las capturas muestran un predio de demostración (_Finca La Esperanza_) con personas y datos ficticios.',
    'Las capturas de escritorio corresponden a un computador; las de teléfono, a un celular Android. El aplicativo es el mismo en ambos: solo cambia la disposición.',
    'Los recuadros **Nota** dan consejos; los recuadros **Importante** advierten sobre algo que no se puede deshacer o que afecta los datos.',
  ]),
]

const antes = [
  h1('2. Antes de empezar'),
  h2('2.1 Qué se necesita'),
  ...vinetas([
    '**En la oficina:** un computador con un navegador actualizado (Google Chrome, Microsoft Edge o Mozilla Firefox).',
    '**En campo:** un teléfono Android con Google Chrome, el GPS (ubicación) activado y conexión a internet en el momento de registrar.',
    '**La dirección del aplicativo**, que entrega el administrador. Siempre empieza por _https://_: la conexión segura es necesaria para que el teléfono comparta su ubicación.',
    '**Una cuenta** (correo y contraseña). Las crea el administrador; no hay registro público.',
  ]),
  nota(
    'La primera vez que el aplicativo pida la ubicación, el navegador preguntará si la permite. Toque **Permitir**. Si la negó por error, actívela de nuevo en los permisos del sitio (ícono del candado junto a la dirección).',
  ),
  h2('2.2 Roles y permisos'),
  p('Cada cuenta tiene un rol, y cada persona solo ve los predios que tiene asignados.'),
  tabla(
    ['Acción', 'Técnico', 'Agrónomo', 'Productor', 'Administrador'],
    [
      ['Consultar mapa, plan, rutas, MTD e historial', 'Sí', 'Sí', 'Sí', 'Sí'],
      ['Registrar lecturas de trampa', 'Sí', 'Sí', 'No', 'Sí'],
      ['Reponer una etiqueta QR dañada', 'Sí', 'Sí', 'No', 'Sí'],
      ['Crear y editar lotes, trampas y rutas', 'No', 'Sí', 'No', 'Sí'],
      ['Programar y reprogramar actividades', 'No', 'Sí', 'No', 'Sí'],
      ['Validar o rechazar lecturas', 'No', 'Sí', 'No', 'Sí'],
      ['Editar los datos y el límite del predio', 'No', 'Sí', 'No', 'Sí'],
      ['Crear predios, asignar personal y administrar cuentas', 'No', 'No', 'No', 'Sí'],
    ],
    [4160, 1300, 1300, 1300, 1300],
  ),
  espacio(),
  nota(
    'Por la Ley 1581 de 2012 (protección de datos personales), el productor no ve quién registró cada lectura ni quién es responsable de cada actividad, y la ubicación GPS de una lectura solo la ven el agrónomo, el administrador y el técnico que la tomó.',
  ),
]

const ingreso = [
  h1('3. Ingreso y navegación'),
  h2('3.1 Iniciar sesión'),
  ...pasos([
    'Abra la dirección del aplicativo en el navegador.',
    'Escriba su **Correo electrónico** y su **Contraseña**.',
    'Toque **Ingresar**. El aplicativo abre el **Mapa** del predio.',
  ]),
  ...figura('01-inicio-sesion.jpg', 'Pantalla de inicio de sesión en el computador.'),
  ...telefono(['30-telefono-inicio.jpg'], 'Inicio de sesión en el teléfono.', 2.3),
  p('Mensajes que pueden aparecer:'),
  tabla(
    ['Mensaje', 'Qué significa y qué hacer'],
    [
      ['«Correo o contraseña incorrectos»', 'Revise los datos. Por seguridad no se indica cuál de los dos está mal. Si olvidó la contraseña, pida al administrador que la restablezca.'],
      ['«Demasiados intentos…»', 'Hubo cinco intentos fallidos seguidos. Espere unos minutos antes de volver a intentarlo.'],
      ['«No tiene predios asignados»', 'Su cuenta existe pero aún no trabaja en ningún predio. Pida al administrador que lo asigne.'],
    ],
    [3000, 6360],
  ),
  espacio(),
  nota(
    'La sesión se mantiene abierta mientras use el aplicativo, aun si recarga la página. Si pasa varios días sin usarlo, o si el administrador cambia su contraseña o su rol, el aplicativo le pedirá ingresar de nuevo.',
  ),
  h2('3.2 El menú y el predio actual'),
  p(
    'En el computador el menú está siempre a la izquierda; en el teléfono se abre con el botón **Menú** de la esquina superior derecha. Arriba aparece el selector **Predio**, si tiene más de uno asignado: todo lo que vea en las demás pantallas corresponde al predio elegido, y el aplicativo lo recuerda la próxima vez.',
  ),
  ...telefono(['32-telefono-menu.jpg'], 'Menú abierto en el teléfono, con el predio actual, las secciones y el botón Salir.', 2.3),
  tabla(
    ['Opción del menú', 'Para qué sirve'],
    [
      ['**Mi semana**', 'Actividades asignadas a usted en la semana (técnico y agrónomo). Capítulo 9.'],
      ['**Mapa**', 'Vista general del predio con el estado de monitoreo de las trampas. Capítulo 4.'],
      ['**Lotes**', 'Registrar y editar los lotes (polígonos). Capítulo 5.'],
      ['**Trampas y QR**', 'Registrar trampas, descargar su QR e imprimir etiquetas. Capítulo 6.'],
      ['**Rutas de monitoreo**', 'Orden de visita de las trampas de cada lote. Capítulo 7.'],
      ['**Planeación**', 'Calendario de 52 semanas y cumplimiento. Capítulo 8.'],
      ['**Lecturas de trampa**', 'Registrar lecturas y, para el agrónomo, validarlas. Capítulos 9 y 10.'],
      ['**MTD e historial**', 'Índice MTD, reporte para el ICA e historial de capturas. Capítulo 11.'],
      ['**Predio**', 'Datos y límite del predio; para el administrador, personal y todos los predios. Capítulo 12.'],
      ['**Usuarios**', 'Cuentas del personal (solo administrador). Capítulo 12.'],
    ],
    [2600, 6760],
  ),
  espacio(),
  p(
    'Al pie del menú aparecen la semana ISO actual, su rol, su nombre y el botón **Salir** para cerrar la sesión. La etiqueta **API ok** confirma que hay conexión con el servidor.',
  ),
]

const mapa = [
  h1('4. Mapa del predio'),
  p(
    'Es la pantalla de inicio. Muestra los indicadores del predio, los lotes con su color, el límite del predio (línea punteada) y las trampas con su estado de monitoreo.',
  ),
  ...figura('02-mapa.jpg', 'Mapa del predio con indicadores, lotes, trampas y leyenda.'),
  h2('4.1 Indicadores'),
  ...vinetas([
    '**Lotes registrados** y hectáreas delimitadas.',
    '**Trampas activas**, separadas en Jackson y McPhail.',
    '**Trampas por revisar**: las vencidas y las pendientes de revisión.',
    '**Trampas inactivas o retiradas** y el total registrado.',
  ]),
  h2('4.2 Estado de monitoreo de las trampas'),
  p('Cada trampa activa se colorea según los días que lleva sin revisión (desde su última lectura o, si no tiene, desde la instalación):'),
  tabla(
    ['Color', 'Estado', 'Significado'],
    [
      ['Verde', '**Al día**', 'Revisada hace menos de 7 días.'],
      ['Amarillo', '**Pendiente**', 'Entre 7 y 13 días sin revisión: le toca visita.'],
      ['Rojo', '**Vencida**', '14 días o más sin revisión.'],
      ['Contorno', '**Inactiva / Retirada**', 'No se monitorea.'],
    ],
    [1600, 2400, 5360],
  ),
  espacio(),
  p('La forma del marcador indica el tipo: **círculo** para Jackson (trimedlure, _Ceratitis capitata_) y **cuadrado** para McPhail (proteína hidrolizada, _Anastrepha_ spp.).'),
  h2('4.3 Consultar una trampa o un lote'),
  ...pasos([
    'Toque una trampa en el mapa. Se abre una ventana con su código ICA, lote, tipo, estado y fecha de la última lectura.',
    'Desde la ventana puede ir a **Registrar lectura** o **Abrir ficha**. En el computador, la ficha completa aparece además a la derecha, con los botones **Registrar lectura**, **Ver ficha y QR** e **Historial**.',
    'Para ver solo un lote, elíjalo en el campo **Lote**. Los botones **Lotes** y **Trampas** muestran u ocultan cada capa, y el botón de capas del mapa cambia entre la imagen satelital y el mapa de calles.',
  ]),
  ...figura('03-mapa-trampa.jpg', 'Trampa seleccionada: ventana sobre el mapa y ficha a la derecha.'),
  ...telefono(['31-telefono-mapa.jpg'], 'El mapa en el teléfono.', 2.3),
  h2('4.4 Exportar lotes y trampas'),
  p(
    'Los botones **Exportar GeoJSON** y **Exportar KML** descargan los lotes y trampas del predio (o del lote filtrado) para abrirlos en QGIS, Google Earth u otro sistema de información geográfica.',
  ),
]

const lotes = [
  h1('5. Lotes'),
  p('Rol: **agrónomo** o **administrador**. Los demás roles consultan los lotes sin modificarlos.'),
  h2('5.1 Registrar un lote'),
  ...pasos([
    'En el menú, abra **Lotes**. Por defecto aparece el formulario **Nuevo lote**.',
    'Toque **Dibujar polígono** y marque en el mapa cada esquina (vértice) del lote. Para cerrarlo, toque de nuevo el primer vértice.',
    'Escriba el **Código** (por ejemplo L-04; no puede repetirse dentro del predio) y, si quiere, un **Nombre o referencia** y el **Color en el mapa**.',
    'Toque **Guardar lote**. El servidor valida el polígono, calcula el **área** en hectáreas y avisa si se traslapa con otro lote o si sale del límite del predio.',
  ]),
  ...figura('05-lote-nuevo.jpg', 'Formulario para registrar un lote nuevo.'),
  nota('El área la calcula siempre el servidor sobre la superficie terrestre; no se escribe a mano.'),
  h2('5.2 Consultar, editar o eliminar un lote'),
  ...pasos([
    'Toque el lote en el mapa o su fila en **Lotes registrados**.',
    'Cambie el código, el nombre o el color en **Datos del lote** y toque **Guardar cambios**.',
    'Para corregir la forma, toque **Editar vértices**, arrastre los puntos en el mapa y guarde.',
    'Para eliminarlo, toque **Eliminar lote** y confirme.',
  ]),
  ...figura('04-lotes.jpg', 'Lote seleccionado con sus datos, área calculada y la lista de lotes.'),
  tabla(
    ['Mensaje', 'Qué hacer'],
    [
      ['El polígono se cruza consigo mismo', 'Redibújelo sin que los lados se crucen.'],
      ['Advertencia de traslape con otro lote', 'Se guarda igual; revise que los bordes no se superpongan por error.'],
      ['Advertencia: el lote sale del límite del predio', 'Se guarda igual; revise el polígono o el límite del predio.'],
      ['Ya existe un lote con ese código', 'Use otro código.'],
      ['No se puede eliminar un lote con trampas', 'Retire o elimine antes sus trampas.'],
    ],
    [4200, 5160],
  ),
  espacio(),
  nota('Al eliminar un lote, también se elimina su ruta. El lote no se borra de la base de datos: queda en el historial.', 'Importante'),
]

const trampas = [
  h1('6. Trampas y códigos QR'),
  p('Rol: **agrónomo** o **administrador** para registrar y editar. El técnico puede reponer etiquetas.'),
  h2('6.1 Registrar una trampa'),
  ...pasos([
    'En el menú, abra **Trampas y QR**. Aparece el formulario **Registrar trampa**.',
    'En **1 · Identificación** escriba el **Código ICA (oficial)**, elija el **Lote**, el **Tipo de trampa** (Jackson + trimedlure o McPhail + proteína hidrolizada) y revise el **Atrayente**.',
    'En **2 · Ubicación**, ubique la trampa de una de tres formas: tocando el punto en el mapa, escribiendo la **Latitud** y la **Longitud** en grados decimales, o con **Usar mi ubicación** (estando junto a la trampa con el teléfono).',
    'Revise la **Fecha de instalación** y toque **Guardar y generar QR**. El aplicativo asigna a la trampa un código QR de 8 caracteres.',
  ]),
  ...figura('08-trampa-nueva.jpg', 'Formulario para registrar una trampa, con el mapa para ubicarla y la vista previa de la etiqueta.'),
  nota(
    'Con **Usar mi ubicación** el aplicativo muestra la precisión del GPS en metros antes de guardar. Si supera 10 m, le avisa: espere unos segundos al aire libre o ubique el punto en el mapa.',
  ),
  p('El servidor rechaza una trampa cuyo punto quede **fuera del polígono de su lote**, y un **código ICA repetido** en cualquier predio.'),
  h2('6.2 Ficha de la trampa y código QR'),
  p(
    'Al tocar una trampa en el mapa o en la lista, se abre su ficha: datos editables, posición en el mapa y la **etiqueta QR**. El QR contiene solo la dirección corta de la trampa (…/t/CÓDIGO); el código impreso debajo sirve para escribirlo a mano si el QR no se puede leer.',
  ),
  ...figura('06-trampa-ficha.jpg', 'Ficha de una trampa con su etiqueta QR.'),
  ...vinetas([
    '**Descargar PNG** o **Descargar SVG**: guarda la imagen del QR.',
    '**Guardar cambios**: actualiza tipo, atrayente, fecha, **Estado** (activa, inactiva o retirada) o la ubicación. Mover la trampa conserva su código QR y su historial de lecturas.',
    '**Imprimir etiquetas del lote** (arriba): genera un PDF tamaño carta con ocho etiquetas por hoja, listas para recortar y pegar en papel adhesivo.',
  ]),
  ...figura('07-trampas-lista.jpg', 'Lista de trampas del lote, con coordenadas, código QR y estado.'),
  ...figura('23-etiquetas-pdf-recorte.jpg', 'PDF de etiquetas del lote: QR, código ICA, lote y tipo de trampa.', 5.2),
  h2('6.3 Reponer una etiqueta dañada'),
  p('En la ficha, bajo **¿Etiqueta dañada?**:'),
  ...vinetas([
    '**Reimprimir etiqueta**: vuelve a generar la misma etiqueta. Úsela si la etiqueta se perdió o se borró pero nadie más la tiene.',
    '**Reemplazar etiqueta**: genera un código nuevo e invalida el anterior. Úsela si la etiqueta vieja sigue pegada en campo o pudo quedar en manos de otros. Pide un motivo y deja registro.',
  ]),
  nota('Después de **Reemplazar etiqueta**, el QR anterior deja de funcionar: al leerlo, el aplicativo indica que fue reemplazado y cuál es la trampa. Retire la etiqueta vieja de la trampa.', 'Importante'),
]

const rutas = [
  h1('7. Rutas de monitoreo'),
  p(
    'Rol: **agrónomo** o **administrador**. La ruta es el orden en que el técnico visita las trampas activas de un lote. Debe incluirlas todas, sin repetir ninguna.',
  ),
  ...pasos([
    'En el menú, abra **Rutas de monitoreo** y elija el **Lote**.',
    'Toque **Ordenar por cercanía**: el aplicativo propone el recorrido más corto yendo siempre a la trampa más cercana.',
    'Ajuste el orden si hace falta: arrastre las paradas en **Orden de visita**, use las flechas, o toque **Ordenar en el mapa** y luego las trampas en el orden deseado.',
    'Revise la línea del recorrido y la distancia total, y toque **Guardar ruta**.',
  ]),
  ...figura('09-rutas.jpg', 'Ruta de monitoreo de un lote: mapa del recorrido, orden de visita y rutas del predio.'),
  nota(
    'Si después se instala, retira, mueve o elimina una trampa del lote, la ruta queda marcada **requiere revisión** en el mapa y en la lista de rutas. Ábrala, ajuste el orden y vuelva a guardarla para quitar el aviso.',
  ),
]

const plan = [
  h1('8. Planeación de actividades'),
  p(
    'El plan organiza por semana ISO (1 a 52 o 53) las actividades del predio. Todos los roles lo consultan; el **agrónomo** y el **administrador** lo modifican.',
  ),
  ...figura('10-plan.jpg', 'Calendario de 52 semanas, lista de la semana actual e indicadores de cumplimiento.'),
  h2('8.1 Leer el calendario'),
  p('Cada fila es un tipo de actividad (las rutas de monitoreo van por lote; los recambios y las labores, por predio) y cada columna una semana. La semana actual va resaltada.'),
  tabla(
    ['Color', 'Estado'],
    [
      ['Verde oscuro', '**Cumplida**: la visita tiene las lecturas de su ruta, el recambio se registró o la labor se marcó como hecha.'],
      ['Verde claro', '**Programada**: aún no llega o está en curso.'],
      ['Amarillo', '**Reprogramada**: se movió de semana con un motivo.'],
      ['Rojo', '**Vencida**: su semana pasó sin cumplirse.'],
    ],
    [2000, 7360],
  ),
  espacio(),
  p('Debajo, **Semana N** lista las actividades de la semana con casillas («N de M cumplidas») y las vencidas recientes; **Cumplimiento** muestra el porcentaje del año por semana y por lote.'),
  h2('8.2 Programar una actividad'),
  ...pasos([
    'Toque **+ Programar actividad** o una celda vacía del calendario (la semana y la fila quedan preelegidas).',
    'Elija el **Tipo de actividad**: **Visita de monitoreo** (requiere que el lote tenga ruta), **Cambio de atrayente** (indique el tipo de trampa) o **Labor cultural** (poda, fertilización, raleo, cosecha, riego, control de malezas u otra).',
    'Elija el **Lote**, la **Semana** y el **Responsable** (una persona asignada al predio). Puede agregar notas.',
    'Para una serie, marque **Repetir** e indique cada cuántas semanas y hasta qué semana.',
    'Toque **Programar**.',
  ]),
  ...figura('13-plan-programar.jpg', 'Formulario para programar una actividad.'),
  h2('8.3 Ver, reprogramar o eliminar una actividad'),
  p('Toque una celda programada para abrir su ficha (fechas, responsable, avance e historial).'),
  ...figura('11-plan-ficha.jpg', 'Ficha de una visita de monitoreo con su avance.'),
  ...vinetas([
    '**Reprogramar**: elija el año y la nueva semana y escriba el **Motivo** (obligatorio, por ejemplo «aumento de capturas de _C. capitata_ en el lote»). El cambio queda en el historial.',
    '**Cambiar responsable**: elija otra persona y toque **Cambiar**.',
    '**Eliminar actividad**: borra esa actividad o, en una serie, también las siguientes.',
    '**Marcar cumplida** (solo labores culturales): las visitas y los recambios se cumplen solos con las lecturas de su semana.',
  ]),
  ...figura('12-plan-reprogramar.jpg', 'Reprogramar una actividad a otra semana con su motivo.'),
]

const campo = [
  h1('9. Trabajo de campo: lecturas de trampa'),
  p('Rol: **técnico** (también agrónomo y administrador). Este capítulo describe el uso en el teléfono.'),
  h2('9.1 Mi semana'),
  p(
    'En **Mi semana** el técnico ve las actividades que tiene asignadas: las visitas de monitoreo con el número de trampas leídas, los recambios de atrayente y las labores. **Ver la ruta en el mapa** abre el recorrido del lote. Con las flechas se pasa a la semana siguiente o anterior.',
  ),
  ...telefono(['33-telefono-mi-semana-p1.jpg', '33-telefono-mi-semana-p2.jpg'], 'Mi semana en el teléfono (dos tramos de la misma pantalla).'),
  h2('9.2 Leer el QR de la trampa'),
  ...pasos([
    'Abra la cámara del teléfono (o el lector de QR) y apunte a la etiqueta de la trampa.',
    'Toque el enlace que aparece. Se abre la **ficha de la trampa** en PERSICA: código ICA, tipo, lote, posición en la ruta («Parada 2 de 3 · sigue …») y la última lectura.',
    'Si el QR no se lee, en el aplicativo puede escribir el código impreso bajo el QR.',
  ]),
  ...telefono(['34-telefono-ficha-qr-p1.jpg', '34-telefono-ficha-qr-p2.jpg'], 'Ficha de la trampa al leer su QR.'),
  nota(
    'Si la ficha dice que la trampa está **retirada** o **inactiva**, no registre la lectura y avise al agrónomo. Si dice que la etiqueta fue **reemplazada**, use la etiqueta nueva de la trampa.',
    'Importante',
  ),
  h2('9.3 Registrar la lectura'),
  ...pasos([
    'En la ficha, toque **Registrar lectura**.',
    'Revise **Fecha y hora** (la del momento) y **Días de exposición**: el aplicativo los calcula desde la revisión anterior. Si los cambia, debe escribir la justificación.',
    'En **Especímenes capturados**, cuente con los botones **+** y **−**: _Ceratitis capitata_ machos, _C. capitata_ hembras y _Anastrepha_ spp. El formulario muestra el MTD de esta trampa a medida que cuenta.',
    'Indique el **Estado de la trampa** (buena, dañada, faltante o reubicada) y si **se cambió el atrayente**.',
    'Escriba las **Observaciones** si hay algo para destacar (frutos caídos, daños, etc.).',
    'Verifique que el aplicativo tomó **su ubicación** (muestra la precisión y la distancia a la trampa) y toque **Registrar lectura**.',
  ]),
  ...telefono(['35-telefono-lectura-p1.jpg', '35-telefono-lectura-p2.jpg'], 'Formulario de lectura de trampa en el teléfono.'),
  p(
    'Al guardar, la confirmación muestra el resumen y la distancia a la trampa. Desde ahí puede **Registrar otra**, volver a **Mi semana**, abrir la **Ruta del lote** o la **Ficha de la trampa**, y ver cuál es la siguiente trampa de la ruta.',
  ),
  ...telefono(['36-telefono-lectura-registrada-p1.jpg', '36-telefono-lectura-registrada-p2.jpg'], 'Lectura registrada.'),
  tabla(
    ['Regla', 'Por qué'],
    [
      ['Una sola lectura por trampa y por día (de cualquier técnico).', 'Evita contar dos veces las mismas moscas en el MTD.'],
      ['Solo trampas **activas**.', 'Las inactivas y retiradas no se monitorean.'],
      ['Hasta 30 días hacia atrás; nunca en el futuro.', 'Las lecturas atrasadas más antiguas las registra el agrónomo.'],
      ['Si no hay GPS, la lectura se registra igual, sin posición.', 'El agrónomo la verá con el aviso «Sin ubicación del teléfono».'],
    ],
    [4800, 4560],
  ),
  espacio(),
  h2('9.4 Registrar sin escanear y consultar mis lecturas'),
  p(
    'En **Lecturas de trampa**, el botón **Registrar lectura** permite elegir el lote y la trampa de una lista (útil si la etiqueta no se puede leer). Debajo, **Mis lecturas** muestra las lecturas propias en tres pestañas: **Pendientes** (sin validar), **Validadas** y **Rechazadas** (con el motivo del agrónomo).',
  ),
  ...telefono(['37-telefono-lecturas-p1.jpg', '37-telefono-lecturas-p2.jpg'], 'Lecturas de trampa: registrar y consultar mis lecturas.'),
]

const validar = [
  h1('10. Validación de lecturas'),
  p(
    'Rol: **agrónomo** o **administrador**. Toda lectura entra como **registrada** (sin validar). El agrónomo la revisa y la **valida** o la **rechaza** con un motivo. Las rechazadas no cuentan para el MTD.',
  ),
  ...figura('14-lecturas-bandeja.jpg', 'Bandeja de lecturas pendientes, con avisos para revisar.'),
  ...pasos([
    'Abra **Lecturas de trampa**. La pestaña **Pendientes** muestra cada lectura con capturas, días de exposición, estado de la trampa, distancia y observaciones.',
    'Revise los **avisos** resaltados: lectura tomada a más de 50 m de la trampa, sin ubicación del teléfono, o con días de exposición cambiados (con su justificación).',
    'Toque **Validar** si la lectura es correcta, o **Rechazar…**, escriba el **Motivo del rechazo** y confirme.',
    'Para avanzar más rápido, **Validar las N sin avisos** valida de una vez todas las que no tienen avisos.',
  ]),
  ...figura('15-lecturas-rechazar.jpg', 'Rechazar una lectura escribiendo el motivo.'),
  nota(
    'Si una lectura con capturas amerita una visita extra, toque **Programar visita adicional**: crea una visita de monitoreo para el lote en la semana siguiente (puede cambiar la semana y el responsable).',
  ),
  p('Se puede cambiar de decisión más adelante desde las pestañas **Validadas** y **Rechazadas**. Si otra persona ya revisó la lectura, el aplicativo lo avisa para no pisar su decisión.'),
]

const mtd = [
  h1('11. Índice MTD, reporte para el ICA e historial'),
  h2('11.1 Índice MTD del predio'),
  p('El MTD se calcula con la fórmula del Manual Técnico de Trampeo del ICA:'),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [new TextRun({ text: 'MTD = M ÷ (T × D)', bold: true, size: 30, color: VERDE })],
  }),
  ...vinetas([
    '**M**: moscas capturadas de la especie en el periodo.',
    '**T**: trampas revisadas en el periodo.',
    '**D**: días promedio de exposición por trampa revisada.',
  ]),
  p(
    'Se calcula por separado para _Ceratitis capitata_ (trampas Jackson) y _Anastrepha_ spp. (trampas McPhail), consolidado para todo el predio y sin las lecturas rechazadas. Cuando T × D es cero (no hubo trampas revisadas) el MTD no se puede calcular y se muestra **sin dato**.',
  ),
  ...pasos([
    'Abra **MTD e historial**. Por defecto muestra las últimas 12 semanas.',
    'Cambie **Desde** y **Hasta** si necesita otro periodo y toque **Calcular**.',
    'Para cada especie verá el MTD del periodo con su cálculo («80 ÷ (4 × 36,5) = 0,5479»), la tendencia semanal y la tabla con M, T, D y MTD de cada semana. Si hay lecturas sin validar incluidas, se indica cuántas.',
  ]),
  ...figura('16-mtd.jpg', 'Índice MTD del predio: valor del periodo, tendencia y tabla semanal.'),
  h2('11.2 Reporte para el ICA'),
  p(
    '**Reporte ICA (PDF)** y **Reporte ICA (CSV)** descargan el consolidado semanal del periodo calculado, por especie, con M, T, D, MTD y lecturas sin validar. El CSV se abre directamente en Excel.',
  ),
  ...figura('24-reporte-mtd-pdf.jpg', 'Primera página del reporte MTD en PDF.', 4.6),
  nota('El formato del reporte es provisional mientras se acuerda con el ICA el formato del convenio.'),
  h2('11.3 Historial de capturas'),
  p(
    '**Historial de capturas** (botón en la pantalla del MTD, o **Ver historial de capturas** en la ficha de una trampa) muestra todas las lecturas con sus capturas, días y MTD de la trampa, y un gráfico de capturas por fecha. Puede filtrar por **Lote**, **Trampa**, **Especie** y periodo (**Desde**, **Hasta**) y descargar el resultado con **Exportar CSV**.',
  ),
  ...figura('17-historial.jpg', 'Historial de capturas con su gráfico y la tabla de lecturas.'),
]

const admin = [
  h1('12. Administración del predio y de las cuentas'),
  h2('12.1 Datos y límite del predio'),
  p(
    'En **Predio**, el agrónomo asignado y el administrador editan la identificación del predio ante el ICA (nombre, vereda, municipio y registro ICA) y su límite:',
  ),
  ...pasos([
    'Toque **Dibujar límite** y marque los vértices en el mapa (o **Editar vértices** si ya existe); **Quitar límite** lo elimina.',
    'Con límite, el **Área (hectáreas)** la calcula el servidor; sin límite, se escribe a mano.',
    'Elija el **Color del límite en el mapa** y toque **Guardar**.',
  ]),
  ...figura('18-predio-agronomo.jpg', 'Predio: límite dibujado sobre el mapa y datos del predio.'),
  h2('12.2 Personal y todos los predios (administrador)'),
  p('El administrador ve además, en la misma pantalla:'),
  ...vinetas([
    '**Personal del predio**: las cuentas asignadas al predio actual. **Asignar una cuenta** agrega a alguien; **Quitar** lo retira (deja de ver el predio).',
    '**Todos los predios**: la lista completa. **+ Nuevo predio** crea uno; **Abrir** lo vuelve el predio actual para editarlo arriba; **Eliminar** lo borra si no tiene lotes.',
  ]),
  ...figura('19-predio-admin.jpg', 'Predio visto por el administrador, con el personal debajo.'),
  ...figura('20-predios-todos.jpg', 'Personal del predio y lista de todos los predios.'),
  h2('12.3 Cuentas de usuario'),
  ...pasos([
    'Abra **Usuarios** y toque **Nuevo usuario**.',
    'Escriba el **Nombre completo**, el **Correo**, elija el **Rol** y una **Contraseña inicial** (mínimo 8 caracteres; las contraseñas obvias se rechazan).',
    'Lea al titular el **Aviso de tratamiento de datos personales**, marque la casilla de autorización y toque **Guardar**.',
    'Entregue la contraseña al titular y asígnelo a su predio (12.2).',
  ]),
  ...figura('22-usuario-nuevo.jpg', 'Nueva cuenta con el aviso de tratamiento de datos (Ley 1581 de 2012).'),
  ...figura('21-usuarios.jpg', 'Lista de cuentas del personal.'),
  ...vinetas([
    '**Editar**: cambia nombre, correo, rol o restablece la contraseña. Al cambiar la contraseña, el rol o el estado, la persona debe volver a ingresar.',
    '**Desactivar**: impide el ingreso sin borrar la cuenta; sus lecturas siguen a su nombre. Se puede reactivar.',
  ]),
  nota('Una cuenta no se elimina: se desactiva. Así se conserva quién registró cada lectura.', 'Importante'),
]

const preguntas = [
  h1('13. Preguntas frecuentes'),
  tabla(
    ['Situación', 'Qué hacer'],
    [
      ['El teléfono no toma la ubicación.', 'Active el GPS, permita la ubicación al sitio (candado junto a la dirección) y verifique que la dirección empiece por https://. Espere unos segundos al aire libre.'],
      ['«Ya hay una lectura de la trampa del día…»', 'Otra persona ya la leyó hoy. Si esa lectura está errada, el agrónomo debe rechazarla para poder registrar otra.'],
      ['«La trampa está inactiva / retirada: no admite lecturas»', 'Avise al agrónomo; si la trampa sigue en campo, él debe activarla.'],
      ['El QR dice que la etiqueta fue reemplazada.', 'Use la etiqueta nueva de esa trampa y retire la vieja.'],
      ['El QR no se lee.', 'Limpie la etiqueta o escriba en el aplicativo el código impreso bajo el QR. Si está muy dañada, use **Reimprimir etiqueta**.'],
      ['Una ruta dice «requiere revisión».', 'Cambiaron las trampas del lote: el agrónomo debe ajustar el orden y guardar la ruta.'],
      ['El MTD dice «sin dato».', 'No hubo trampas de esa especie revisadas en la semana o el periodo.'],
      ['No veo un predio, un lote o una trampa.', 'Revise el selector **Predio**: solo ve los predios asignados a su cuenta.'],
      ['Me sacó de la sesión.', 'Ingrese de nuevo. Pasa si venció la sesión o si el administrador cambió su contraseña, rol o estado.'],
    ],
    [3600, 5760],
  ),
  h1('14. Glosario'),
  tabla(
    ['Término', 'Definición'],
    [
      ['**Atrayente**', 'Sustancia que atrae a las moscas: trimedlure (Jackson) o proteína hidrolizada (McPhail).'],
      ['**Código ICA**', 'Identificador oficial de la trampa ante el ICA.'],
      ['**Código QR**', 'Código de 8 caracteres de la etiqueta de la trampa; abre su ficha en PERSICA.'],
      ['**Días de exposición**', 'Días que la trampa estuvo en campo desde la revisión anterior (o la instalación).'],
      ['**Lote**', 'Unidad del predio delimitada por un polígono.'],
      ['**MTD**', 'Índice moscas/trampa/día: M ÷ (T × D).'],
      ['**Ruta**', 'Orden de visita de las trampas activas de un lote.'],
      ['**Semana ISO**', 'Numeración de semanas del año (1 a 52 o 53) de lunes a domingo.'],
      ['**Trampa Jackson**', 'Trampa con trimedlure para _Ceratitis capitata_ (mosca del Mediterráneo).'],
      ['**Trampa McPhail**', 'Trampa con proteína hidrolizada para _Anastrepha_ spp.'],
    ],
    [2600, 6760],
  ),
]

// ============================ DOCUMENTO ============================

const doc = new Document({
  creator: 'PERSICA',
  title: 'PERSICA · Manual de usuario',
  description: 'Manual de usuario del aplicativo PERSICA (HU-38)',
  styles: {
    default: { document: { run: { font: 'Arial', size: 21 } } },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 34, bold: true, font: 'Arial', color: VERDE },
        paragraph: { spacing: { before: 0, after: 240 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: VERDE },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1, keepNext: true },
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 22, bold: true, font: 'Arial', color: '333333' },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2, keepNext: true },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'vinetas',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }],
      },
      {
        reference: 'pasos',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }],
      },
    ],
  },
  features: { updateFields: true },
  sections: [
    {
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } }, titlePage: true },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFCFC4', space: 4 } },
              children: [new TextRun({ text: 'PERSICA · Manual de usuario', size: 16, color: '777777' })],
            }),
          ],
        }),
        first: new Header({ children: [new Paragraph('')] }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], size: 16, color: '777777' })],
            }),
          ],
        }),
        first: new Footer({ children: [new Paragraph('')] }),
      },
      children: [
        ...portada,
        ...indice,
        ...introduccion,
        ...antes,
        ...ingreso,
        ...mapa,
        ...lotes,
        ...trampas,
        ...rutas,
        ...plan,
        ...campo,
        ...validar,
        ...mtd,
        ...admin,
        ...preguntas,
      ],
    },
  ],
})

const salida = process.argv[2] || path.join(__dirname, 'Manual_de_usuario_PERSICA.docx')
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(salida, buffer)
  console.log(`${salida} · ${figuras} figuras · ${(buffer.length / 1e6).toFixed(1)} MB`)
})
