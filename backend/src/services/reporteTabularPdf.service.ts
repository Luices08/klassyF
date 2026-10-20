import PDFDocument from 'pdfkit';
import { ReporteTabular } from '../utils/reporteTabular';

type Documento = InstanceType<typeof PDFDocument>;

// Los mismos tonos de la guía visual, para que el papel se parezca a la pantalla.
const COLOR = { ink: '#172235', cuerpo: '#3F4D61', tenue: '#788794', borde: '#DDE4EC', azulSuave: '#EAF3FF', gris: '#F1F5F9' };
const MARGEN = 30;
const ALTO_FILA = 14;

function recortar(doc: Documento, texto: string, ancho: number): string {
  if (doc.widthOfString(texto) <= ancho) return texto;
  let corto = texto;
  while (corto.length > 1 && doc.widthOfString(`${corto}…`) > ancho) corto = corto.slice(0, -1);
  return `${corto}…`;
}

/** Un PDF horizontal con el listado: encabezado con el alcance y el estado de los datos, resumen y la tabla (el encabezado se repite en cada hoja). */
export function generarPdfTabular(reporte: ReporteTabular): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: 36 }, autoFirstPage: false, bufferPages: true });
  const partes: Buffer[] = [];
  doc.on('data', (p: Buffer) => partes.push(p));
  const listo = new Promise<{ buffer: Buffer; nombreArchivo: string }>((resolve, reject) => {
    doc.on('end', () => resolve({ buffer: Buffer.concat(partes), nombreArchivo: `${reporte.nombre_archivo}.pdf` }));
    doc.on('error', reject);
  });

  doc.addPage();
  const anchoUtil = doc.page.width - MARGEN * 2;
  const limite = doc.page.height - 44;
  const suma = reporte.columnas.reduce((s, c) => s + c.ancho, 0);
  const anchos = reporte.columnas.map((c) => (c.ancho / suma) * anchoUtil);

  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR.ink).text(`${reporte.institucion} — ${reporte.titulo} ${reporte.anio}`, MARGEN, MARGEN, { width: anchoUtil });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.cuerpo).text(reporte.alcance, MARGEN, doc.y + 2, { width: anchoUtil });
  doc.font('Helvetica-Oblique').fontSize(7).fillColor(COLOR.tenue).text(reporte.leyenda, MARGEN, doc.y + 2, { width: anchoUtil });
  if (reporte.resumen.length > 0) {
    doc.font('Helvetica').fontSize(8).fillColor(COLOR.cuerpo).text(reporte.resumen.map(([e, v]) => `${e}: ${v}`).join('   ·   '), MARGEN, doc.y + 4, { width: anchoUtil });
  }
  let y = doc.y + 8;

  const encabezado = () => {
    doc.rect(MARGEN, y, anchoUtil, ALTO_FILA).fill(COLOR.azulSuave);
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLOR.ink);
    let x = MARGEN;
    reporte.columnas.forEach((c, i) => {
      doc.text(recortar(doc, c.titulo, (anchos[i] as number) - 4), x + 2, y + 4, { width: (anchos[i] as number) - 4, align: c.alinear ?? 'left', lineBreak: false });
      x += anchos[i] as number;
    });
    y += ALTO_FILA;
  };
  encabezado();

  if (reporte.filas.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR.tenue).text(reporte.mensaje_vacio, MARGEN + 2, y + 6, { width: anchoUtil });
  }
  reporte.filas.forEach((datos, r) => {
    if (y + ALTO_FILA > limite) {
      doc.addPage();
      y = MARGEN;
      encabezado();
    }
    if (r % 2 === 1) doc.rect(MARGEN, y, anchoUtil, ALTO_FILA).fill(COLOR.gris);
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.ink);
    let x = MARGEN;
    reporte.columnas.forEach((c, i) => {
      const valor = datos[c.clave];
      const texto = valor === null || valor === undefined ? '' : String(valor);
      doc.text(recortar(doc, texto, (anchos[i] as number) - 4), x + 2, y + 4, { width: (anchos[i] as number) - 4, align: c.alinear ?? 'left', lineBreak: false });
      x += anchos[i] as number;
    });
    y += ALTO_FILA;
  });

  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.tenue).text(`Generado el ${reporte.generado_en.toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · Hoja ${i + 1} de ${paginas.count}`, MARGEN, doc.page.height - 26, { width: anchoUtil, align: 'right', lineBreak: false });
  }
  doc.end();
  return listo;
}
