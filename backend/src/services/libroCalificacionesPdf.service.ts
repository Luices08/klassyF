import PDFDocument from 'pdfkit';
import { ReporteSabana } from './sabanaCalificaciones.service';
import { dibujarGrupo } from './sabanaPdf.service';

const COLOR = { ink: '#172235', cuerpo: '#3F4D61', tenue: '#788794', peligro: '#EF5350' };
const MARGEN = 30;

/** Lo que el libro congela al emitirse: el PDF se dibuja solo desde esto, así una reimpresión es el mismo documento. */
export interface ContenidoLibro {
  institucion: string;
  anio: number;
  grado: string;
  sede: string;
  /** ISO: una fecha dentro del contenido congelado se serializa siempre igual. */
  generado_en: string;
  nota_aprobatoria: number;
  mostrar_puesto: boolean;
  grupos: ReporteSabana['grupos'];
  firmantes: Array<{ cargo: string; nombre: string }>;
  total_estudiantes: number;
}

export interface DatosDeEmision {
  codigo: string;
  folio_inicial: number;
  huella: string;
  anulado: boolean;
}

/**
 * Dibuja el libro: portada, una sección por grupo (la sábana definitiva), hoja de constancia con las firmas y, en cada hoja, su folio, el código del libro
 * y la huella corta. Pura: no toca la base. Las hojas no dependen de los dígitos de los folios, así que contar las páginas con folios de prueba da lo mismo
 * que con los reales.
 */
export function renderizarLibro(c: ContenidoLibro, d: DatosDeEmision): Promise<{ buffer: Buffer; paginas: number }> {
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: 20 }, bufferPages: true, autoFirstPage: false });
  const partes: Buffer[] = [];
  doc.on('data', (p: Buffer) => partes.push(p));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
  const ancho = (): number => doc.page.width - MARGEN * 2;

  // Portada
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR.cuerpo).text(c.institucion, MARGEN, 150, { width: ancho(), align: 'center' });
  doc.font('Helvetica-Bold').fontSize(26).fillColor(COLOR.ink).text('Libro de calificaciones', MARGEN, doc.y + 14, { width: ancho(), align: 'center' });
  doc.font('Helvetica').fontSize(13).fillColor(COLOR.cuerpo).text('Registro escolar consolidado (Decreto 1290 de 2009, art. 16)', MARGEN, doc.y + 4, { width: ancho(), align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR.ink).text(`Año lectivo ${c.anio} · ${c.grado}`, MARGEN, doc.y + 28, { width: ancho(), align: 'center' });
  doc.font('Helvetica').fontSize(12).fillColor(COLOR.cuerpo).text(c.sede, MARGEN, doc.y + 4, { width: ancho(), align: 'center' });
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR.ink).text(`Libro ${d.codigo}`, MARGEN, doc.y + 24, { width: ancho(), align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor(COLOR.cuerpo).text(`${c.total_estudiantes} estudiantes en ${c.grupos.length} ${c.grupos.length === 1 ? 'grupo' : 'grupos'}: ${c.grupos.map((g) => g.grupo.etiqueta).join(', ')}`, MARGEN, doc.y + 6, { width: ancho(), align: 'center' });
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR.tenue).text(`Emitido el ${new Date(c.generado_en).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' })}`, MARGEN, doc.y + 10, { width: ancho(), align: 'center' });

  // La sábana definitiva de cada grupo.
  const reporte: ReporteSabana = {
    generado_en: new Date(c.generado_en),
    institucion: c.institucion,
    anio: c.anio,
    corte: 'Cierre del año',
    estado_datos: 'DEFINITIVO',
    leyenda: 'Registro definitivo: todos los estudiantes tienen el cierre de promoción del año.',
    nota_aprobatoria: c.nota_aprobatoria,
    mostrar_puesto: c.mostrar_puesto,
    incluye_promocion: true,
    grupos: c.grupos,
  };
  for (const g of c.grupos) dibujarGrupo(doc, reporte, g);

  // Constancia y firmas
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(14).fillColor(COLOR.ink).text('Constancia', MARGEN, 70, { width: ancho() });
  doc.font('Helvetica').fontSize(10.5).fillColor(COLOR.cuerpo).text(
    `Se deja constancia de que este libro (${d.codigo}) reúne las calificaciones definitivas y el resultado de promoción del año lectivo ${c.anio} de ${c.grado} en ${c.sede}, ` +
      `con el cierre de promoción de ${c.total_estudiantes} estudiantes. Va foliado y se conserva en el archivo de la institución. Cualquier cambio posterior en el sistema ` +
      `no lo modifica: este documento se dibuja solo desde lo que se emitió y su huella permite comprobar que no fue alterado.`,
    MARGEN, doc.y + 8, { width: ancho(), lineGap: 2 }
  );
  const yFirmas = doc.y + 80;
  const columna = ancho() / Math.max(1, c.firmantes.length);
  c.firmantes.forEach((f, i) => {
    const x = MARGEN + i * columna + 30;
    doc.moveTo(x, yFirmas).lineTo(x + columna - 60, yFirmas).lineWidth(0.7).strokeColor(COLOR.tenue).stroke();
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR.ink).text(f.cargo, x, yFirmas + 5, { width: columna - 60, align: 'center' });
    if (f.nombre) doc.font('Helvetica').fontSize(9).fillColor(COLOR.cuerpo).text(f.nombre, x, doc.y, { width: columna - 60, align: 'center' });
  });

  // Folio, código y huella en cada hoja; un libro anulado lo dice en todas.
  const { start, count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i += 1) {
    doc.switchToPage(start + i);
    if (d.anulado) doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.peligro).text('ANULADO: este libro no tiene validez', MARGEN, 14, { width: ancho(), align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.tenue);
    doc.text(`Libro ${d.codigo} · huella ${d.huella.slice(0, 12)}`, MARGEN, doc.page.height - 34, { width: ancho() / 2, align: 'left', lineBreak: false });
    doc.font('Helvetica-Bold').text(`Folio ${d.folio_inicial + i} de ${d.folio_inicial + count - 1}`, MARGEN + ancho() / 2, doc.page.height - 34, { width: ancho() / 2, align: 'right', lineBreak: false });
  }
  doc.end();
  return listo.then((buffer) => ({ buffer, paginas: count }));
}
