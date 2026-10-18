// Ayudas para generar los documentos Word de PERSICA (manual de usuario y documento técnico) con
// la librería docx: mismo estilo, portada, índice, figuras y tablas numeradas.
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
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TabStopType,
  TableRow,
  TextRun,
  WidthType,
  VerticalAlign,
} = require('docx')

const VERDE = '1F5A32'
const VERDE_CLARO = 'E8F1EA'
const DURAZNO = 'C4572E'
const ANCHO_PAGINA = 9360 // DXA: 6,5" de contenido en carta con márgenes de 1"
const MONO = 'Courier New'

// Tamaño de una imagen JPEG o PNG, para conservar la proporción.
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

// Texto con **negrita**, _cursiva_ y `código`.
function runs(texto, base = {}) {
  const partes = texto.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g).filter(Boolean)
  return partes.map((t) =>
    t.startsWith('**')
      ? new TextRun({ ...base, text: t.slice(2, -2), bold: true })
      : t.startsWith('`') && t.endsWith('`') && t.length > 2
        ? new TextRun({ ...base, text: t.slice(1, -1), font: MONO, size: (base.size ?? 21) - 2 })
        : t.startsWith('_') && t.endsWith('_') && t.length > 2
          ? new TextRun({ ...base, text: t.slice(1, -1), italics: true })
          : new TextRun({ ...base, text: t }),
  )
}

function crear({ imagenes }) {
  const titulos = []
  let lista = 0
  let figuras = 0
  let tablas = 0

  const p = (texto, opciones = {}) =>
    new Paragraph({ children: runs(texto), spacing: { after: 120 }, ...opciones })
  const h1 = (texto) => {
    titulos.push({ texto, nivel: 1 })
    return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(texto)] })
  }
  const h2 = (texto) => {
    titulos.push({ texto, nivel: 2 })
    return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(texto)] })
  }
  const h3 = (texto) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(texto)] })
  const vinetas = (items) =>
    items.map((t) => new Paragraph({ numbering: { reference: 'vinetas', level: 0 }, children: runs(t), spacing: { after: 60 } }))
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

  // Bloque de comandos o código: una línea por párrafo, en monoespaciado y con fondo.
  const codigo = (lineas) =>
    lineas.split('\n').map(
      (linea, i, todas) =>
        new Paragraph({
          children: [new TextRun({ text: linea || ' ', font: MONO, size: 17 })],
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F1', color: 'auto' },
          spacing: { before: i === 0 ? 80 : 0, after: i === todas.length - 1 ? 160 : 0 },
          indent: { left: 160, right: 160 },
          keepNext: i < todas.length - 1,
        }),
    )

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

  function imagen(archivo, anchoPulgadas, altoMaximo = 8.4) {
    const ruta = path.join(imagenes, archivo)
    const { w, h } = tamano(ruta)
    // Ancho pedido, sin pasar del alto útil de la página.
    const ancho = Math.min(anchoPulgadas, (altoMaximo * w) / h) * 96
    return new ImageRun({
      type: archivo.endsWith('.png') ? 'png' : 'jpg',
      data: fs.readFileSync(ruta),
      transformation: { width: Math.round(ancho), height: Math.round((ancho * h) / w) },
      altText: { title: archivo, description: archivo, name: archivo },
    })
  }

  const figura = (archivo, texto, ancho = 6.5) => [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { before: 120, after: 60 },
      children: [imagen(archivo, ancho)],
    }),
    leyenda(texto),
  ]

  // Varias imágenes una al lado de la otra (p. ej. capturas de teléfono).
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

  // Tabla con encabezado verde. `leyendaTabla` (opcional) la numera como «Tabla N.».
  function tabla(encabezados, filas, anchos, { tamanoLetra = 19, leyendaTabla } = {}) {
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
            children: cabecera
              ? [new TextRun({ text: texto, bold: true, color: 'FFFFFF', size: tamanoLetra })]
              : runs(String(texto), { size: tamanoLetra }),
          }),
        ],
      })
    const contenido = new Table({
      width: { size: total, type: WidthType.DXA },
      columnWidths: anchos,
      rows: [
        new TableRow({ tableHeader: true, children: encabezados.map((t, i) => celda(t, i, true)) }),
        ...filas.map((f) => new TableRow({ cantSplit: true, children: f.map((t, i) => celda(t, i, false)) })),
      ],
    })
    if (!leyendaTabla) return contenido
    tablas += 1
    return [
      new Paragraph({
        keepNext: true,
        spacing: { before: 160, after: 80 },
        children: [
          new TextRun({ text: `Tabla ${tablas}. `, bold: true, size: 18, color: '555555' }),
          new TextRun({ text: leyendaTabla, italics: true, size: 18, color: '555555' }),
        ],
      }),
      contenido,
      new Paragraph({ spacing: { after: 120 }, children: [] }),
    ]
  }
  const espacio = () => new Paragraph({ spacing: { after: 120 }, children: [] })

  const portada = ({ logo, titulo, subtitulo, lineas, pie }) => [
    new Paragraph({ spacing: { before: 1200 }, alignment: AlignmentType.CENTER, children: [imagen(logo, 2.6)] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 360, after: 120 },
      children: [new TextRun({ text: titulo, bold: true, size: 56, color: VERDE })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [new TextRun({ text: subtitulo, size: 26, color: '444444' })],
    }),
    ...lineas.map((t) => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, size: 22 })] })),
    ...pie.map(
      (t, i) =>
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: i === 0 ? { before: 1600 } : undefined,
          children: [new TextRun({ text: t, size: 20, color: '555555' })],
        }),
    ),
  ]

  // Índice: campo de Word, o escrito con las páginas ya conocidas (para el PDF hecho con
  // LibreOffice, que no llena bien el campo): `archivoToc` es un JSON [{ texto, nivel, pagina }].
  const indice = (archivoToc) => [
    new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: 'Contenido', bold: true, size: 32, color: VERDE })], spacing: { after: 240 } }),
    ...(archivoToc
      ? JSON.parse(fs.readFileSync(archivoToc, 'utf8')).map(
          ({ texto, nivel, pagina }) =>
            new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: ANCHO_PAGINA, leader: 'dot' }],
              indent: { left: nivel === 2 ? 280 : 0 },
              spacing: { after: 20 },
              children: [new TextRun({ text: `${texto}\t${pagina}`, size: 19, bold: nivel === 1 })],
            }),
        )
      : [new TableOfContents('Contenido', { headingStyleRange: '1-2' })]),
  ]

  // Documento carta con encabezado y pie (sin ellos en la portada).
  function documento({ titulo, descripcion, encabezado, contenido }) {
    return new Document({
      creator: 'PERSICA',
      title: titulo,
      description: descripcion,
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
                  children: [new TextRun({ text: encabezado, size: 16, color: '777777' })],
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
          children: contenido,
        },
      ],
    })
  }

  // Escribe el .docx (y, si se pide, la lista de títulos para el índice del PDF).
  async function guardar(doc, salida, archivoTitulos) {
    if (archivoTitulos) fs.writeFileSync(archivoTitulos, JSON.stringify(titulos))
    const buffer = await Packer.toBuffer(doc)
    fs.writeFileSync(salida, buffer)
    console.log(`${salida} · ${figuras} figuras · ${tablas} tablas · ${(buffer.length / 1e6).toFixed(1)} MB`)
  }

  return {
    p, h1, h2, h3, vinetas, pasos, nota, codigo, leyenda, imagen, figura, telefono, tabla, espacio,
    portada, indice, documento, guardar,
    runs,
    get figuras() {
      return figuras
    },
  }
}

module.exports = { crear, runs, VERDE, VERDE_CLARO, DURAZNO, ANCHO_PAGINA, MONO }
