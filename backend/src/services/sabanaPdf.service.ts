import PDFDocument from 'pdfkit';
import { ReporteSabana, SabanaDeGrupo } from './sabanaCalificaciones.service';

type Documento = InstanceType<typeof PDFDocument>;

// Los mismos tonos de la guía visual, para que el papel se parezca a la pantalla.
const COLOR = { ink: '#172235', cuerpo: '#3F4D61', tenue: '#788794', borde: '#DDE4EC', azulSuave: '#EAF3FF', rojo: '#EF5350', rojoSuave: '#FFF0F0', naranjaSuave: '#FFF5E6', gris: '#F1F5F9' };
const MARGEN = 30;
const ALTO_FILA = 14;

const nota = (n: number | null, decimales = 2): string => (n === null ? '' : n.toFixed(decimales));

function recortar(doc: Documento, texto: string, ancho: number): string {
  if (doc.widthOfString(texto) <= ancho) return texto;
  let corto = texto;
  while (corto.length > 1 && doc.widthOfString(`${corto}…`) > ancho) corto = corto.slice(0, -1);
  return `${corto}…`;
}

interface Columna {
  titulo: string;
  ancho: number;
  alinear: 'left' | 'center';
}

function columnasDe(reporte: ReporteSabana, g: SabanaDeGrupo, anchoUtil: number): Columna[] {
  const fijas: Columna[] = [
    { titulo: 'N.º', ancho: 18, alinear: 'center' },
    { titulo: 'Documento', ancho: 52, alinear: 'left' },
    { titulo: 'Apellidos y nombres', ancho: 140, alinear: 'left' },
  ];
  const finales: Columna[] = [{ titulo: 'Prom.', ancho: 32, alinear: 'center' }];
  if (reporte.mostrar_puesto) finales.push({ titulo: 'Puesto', ancho: 30, alinear: 'center' });
  finales.push({ titulo: 'Rep.', ancho: 26, alinear: 'center' }, { titulo: 'Fallas', ancho: 30, alinear: 'center' });
  if (reporte.incluye_promocion) finales.push({ titulo: 'Promoción', ancho: 96, alinear: 'left' });
  const usado = [...fijas, ...finales].reduce((s, c) => s + c.ancho, 0);
  const porAsignatura = Math.max(18, Math.min(34, (anchoUtil - usado) / Math.max(1, g.asignaturas.length)));
  return [...fijas, ...g.asignaturas.map((a) => ({ titulo: a.abreviatura, ancho: porAsignatura, alinear: 'center' as const })), ...finales];
}

function encabezadoDeTabla(doc: Documento, columnas: Columna[], y: number): number {
  let x = MARGEN;
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLOR.ink);
  doc.rect(MARGEN, y, columnas.reduce((s, c) => s + c.ancho, 0), ALTO_FILA).fill(COLOR.azulSuave);
  doc.fillColor(COLOR.ink);
  for (const c of columnas) {
    doc.text(recortar(doc, c.titulo, c.ancho - 3), x + 1.5, y + 4, { width: c.ancho - 3, align: c.alinear, lineBreak: false });
    x += c.ancho;
  }
  return y + ALTO_FILA;
}

export function dibujarGrupo(doc: Documento, reporte: ReporteSabana, g: SabanaDeGrupo): void {
  doc.addPage();
  const anchoUtil = doc.page.width - MARGEN * 2;
  const limite = doc.page.height - 50;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR.ink).text(`${reporte.institucion} — Sábana de calificaciones ${reporte.corte} ${reporte.anio}`, MARGEN, MARGEN, { width: anchoUtil });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.cuerpo).text(`Grupo ${g.grupo.etiqueta} · ${g.grupo.sede} · ${g.grupo.jornada}`, MARGEN, doc.y + 2, { width: anchoUtil });
  doc.font('Helvetica-Oblique').fontSize(7).fillColor(COLOR.tenue).text(reporte.leyenda, MARGEN, doc.y + 2, { width: anchoUtil });

  const columnas = columnasDe(reporte, g, anchoUtil);
  const ancho = columnas.reduce((s, c) => s + c.ancho, 0);
  let y = encabezadoDeTabla(doc, columnas, doc.y + 6);
  const nAsig = g.asignaturas.length;
  const colPromedio = 3 + nAsig;

  g.filas.forEach((f, i) => {
    if (y + ALTO_FILA > limite) {
      doc.addPage();
      y = encabezadoDeTabla(doc, columnas, MARGEN);
    }
    if (i % 2 === 1) doc.rect(MARGEN, y, ancho, ALTO_FILA).fill(COLOR.gris);
    const valores: string[] = [String(i + 1), f.numero_documento, `${f.apellidos}, ${f.nombres}`];
    const celdasNota = g.asignaturas.map((a) => f.notas[a.subject_id]);
    const textos = [
      ...valores,
      ...celdasNota.map((c) => (!c ? '' : c.exenta ? 'EX' : nota(c.nota, 1))),
      nota(f.promedio),
      ...(reporte.mostrar_puesto ? [f.puesto === null ? '' : String(f.puesto)] : []),
      String(f.reprobadas),
      String(f.fallas),
      ...(reporte.incluye_promocion ? [f.promocion ? `${f.promocion.texto}${f.promocion.oficial ? '' : '*'}` : ''] : []),
    ];
    let x = MARGEN;
    textos.forEach((t, k) => {
      const c = columnas[k]!;
      const celda = k >= 3 && k < 3 + nAsig ? celdasNota[k - 3] : undefined;
      const perdida = celda && !celda.exenta && celda.nota !== null && celda.nota < reporte.nota_aprobatoria;
      if (perdida) doc.rect(x, y, c.ancho, ALTO_FILA).fill(COLOR.rojoSuave);
      else if (celda?.recuperada) doc.rect(x, y, c.ancho, ALTO_FILA).fill(COLOR.naranjaSuave);
      const reprobadas = k === colPromedio + (reporte.mostrar_puesto ? 2 : 1) && f.reprobadas > 0;
      doc.font(perdida || reprobadas || k === colPromedio ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.5).fillColor(perdida || reprobadas ? COLOR.rojo : COLOR.ink);
      doc.text(recortar(doc, t, c.ancho - 3), x + 1.5, y + 4, { width: c.ancho - 3, align: c.alinear, lineBreak: false });
      x += c.ancho;
    });
    y += ALTO_FILA;
  });

  // Resumen para el docente, bajo cada asignatura.
  const resumenes: Array<[string, (r: SabanaDeGrupo['resumen'][number]) => string]> = [
    ['Promedio', (r) => nota(r.promedio)],
    ['Aprobaron', (r) => String(r.aprobaron)],
    ['Reprobaron', (r) => String(r.reprobaron)],
    ['Sin nota', (r) => String(r.sin_nota)],
  ];
  y += 4;
  if (y + ALTO_FILA * resumenes.length > limite) {
    doc.addPage();
    y = MARGEN;
  }
  const xAsignaturas = MARGEN + columnas.slice(0, 3).reduce((s, c) => s + c.ancho, 0);
  for (const [titulo, valor] of resumenes) {
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLOR.cuerpo).text(titulo, MARGEN, y + 4, { width: xAsignaturas - MARGEN - 4, align: 'right', lineBreak: false });
    let x = xAsignaturas;
    g.resumen.forEach((r, k) => {
      const c = columnas[3 + k]!;
      doc.rect(x, y, c.ancho, ALTO_FILA).fill(COLOR.gris);
      doc.font('Helvetica').fontSize(6.5).fillColor(COLOR.ink).text(valor(r), x + 1, y + 4, { width: c.ancho - 2, align: 'center', lineBreak: false });
      x += c.ancho;
    });
    y += ALTO_FILA;
  }

  const abreviaturas = g.asignaturas.map((a) => `${a.abreviatura} = ${a.nombre}`).join('   ·   ');
  const pie = `${abreviaturas}\nRojo: por debajo de ${reporte.nota_aprobatoria}. Naranja: nota con recuperación. EX: exenta por traslado. Vacío: sin nota cerrada.${reporte.incluye_promocion ? ' * Decisión proyectada (aún sin cierre de promoción).' : ''}`;
  doc.font('Helvetica').fontSize(6.5).fillColor(COLOR.tenue);
  const altoPie = doc.heightOfString(pie, { width: anchoUtil });
  if (y + 8 + altoPie > doc.page.height - 36) {
    doc.addPage();
    y = MARGEN;
  }
  doc.text(pie, MARGEN, y + 8, { width: anchoUtil });
}

/** Un PDF horizontal con una sección (una o más hojas) por grupo. */
export async function generarPdfSabana(reporte: ReporteSabana): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: 20 }, bufferPages: true, autoFirstPage: false });
  const partes: Buffer[] = [];
  doc.on('data', (parte: Buffer) => partes.push(parte));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  for (const g of reporte.grupos) dibujarGrupo(doc, reporte, g);

  const { start, count } = doc.bufferedPageRange();
  const generado = reporte.generado_en.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  for (let i = 0; i < count; i += 1) {
    doc.switchToPage(start + i);
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.tenue);
    doc.text(`Generado el ${generado} · Página ${i + 1} de ${count}`, MARGEN, doc.page.height - 34, { width: doc.page.width - MARGEN * 2, align: 'right', lineBreak: false });
  }
  doc.end();

  const alcance = reporte.grupos.length === 1 ? reporte.grupos[0]!.grupo.etiqueta : 'todos-los-grupos';
  const corte = reporte.corte.toLowerCase().replace(/\s+/g, '-');
  return { buffer: await listo, nombreArchivo: `sabana-${reporte.anio}-${corte}-${alcance}.pdf`.replace(/[^\w.\-áéíóúñ]/gi, '-') };
}
