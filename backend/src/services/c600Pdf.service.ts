import PDFDocument from 'pdfkit';
import { ConteoSexo } from '../utils/c600';
import type { ReporteC600 } from './c600.service';

type Documento = InstanceType<typeof PDFDocument>;

const COLOR = { ink: '#172235', cuerpo: '#3F4D61', tenue: '#788794', borde: '#DDE4EC', azulSuave: '#EAF3FF', gris: '#F1F5F9' };
const MARGEN = 28;
const LINEA = '________________';

interface Celda {
  t: string | number;
  span?: number;
  negrita?: boolean;
  fondo?: string;
  izquierda?: boolean;
}

/** Dibuja una tabla de rejilla con encabezado de varias filas (celdas que abarcan columnas) y la repite al pasar de hoja. Devuelve la `y` donde queda. */
function tabla(doc: Documento, y: number, anchos: number[], cabeceras: Celda[][], filas: Celda[][], tamano: number): number {
  const alto = tamano + 7;
  const limite = doc.page.height - 40;
  const dibujarFila = (celdas: Celda[], yFila: number) => {
    let col = 0;
    let x = MARGEN;
    for (const c of celdas) {
      const span = c.span ?? 1;
      const ancho = anchos.slice(col, col + span).reduce((s, a) => s + a, 0);
      if (c.fondo) doc.rect(x, yFila, ancho, alto).fillAndStroke(c.fondo, COLOR.borde);
      else doc.rect(x, yFila, ancho, alto).stroke(COLOR.borde);
      doc.font(c.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(tamano).fillColor(COLOR.ink);
      doc.text(String(c.t), x + 2, yFila + 4, { width: ancho - 4, align: c.izquierda ? 'left' : 'center', lineBreak: false, ellipsis: true });
      x += ancho;
      col += span;
    }
  };
  const encabezado = (yInicio: number) => {
    let yy = yInicio;
    for (const fila of cabeceras) {
      dibujarFila(fila.map((c) => ({ ...c, negrita: true, fondo: COLOR.azulSuave })), yy);
      yy += alto;
    }
    return yy;
  };
  let yy = encabezado(y);
  for (const fila of filas) {
    if (yy + alto > limite) {
      doc.addPage();
      yy = encabezado(MARGEN);
    }
    dibujarFila(fila, yy);
    yy += alto;
  }
  return yy;
}

/** Título de sección: si no cabe al menos una fila bajo él se pasa a la hoja siguiente. */
function seccion(doc: Documento, y: number, titulo: string): number {
  let yy = y;
  if (yy + 70 > doc.page.height - 40) {
    doc.addPage();
    yy = MARGEN;
  }
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.ink).text(titulo, MARGEN, yy, { width: doc.page.width - MARGEN * 2, align: 'center' });
  return doc.y + 4;
}

const conteo = (c: ConteoSexo, sexos: Array<'H' | 'M' | 'O'>): number[] => [...sexos.map((s) => c[s]), c.total];

/** El reporte C-600 como PDF: el mismo contenido de la vista previa y del Excel, con el sector y los códigos DIVIPOLA como líneas para escribir. */
export function generarPdfC600(r: ReporteC600): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: 36 }, autoFirstPage: false, bufferPages: true });
  const partes: Buffer[] = [];
  doc.on('data', (p: Buffer) => partes.push(p));
  const listo = new Promise<{ buffer: Buffer; nombreArchivo: string }>((resolve, reject) => {
    doc.on('end', () => resolve({ buffer: Buffer.concat(partes), nombreArchivo: `${r.nombre_archivo}.pdf` }));
    doc.on('error', reject);
  });

  doc.addPage();
  const ancho = doc.page.width - MARGEN * 2;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR.ink).text('REPORTE ESTADÍSTICO DE EFICIENCIA INTERNA (DANE C-600)', MARGEN, MARGEN, { width: ancho, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.ink).text(`Nombre del establecimiento: ${r.institucion.nombre}`, MARGEN, doc.y + 6, { width: ancho });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.cuerpo);
  doc.text(`Código DANE: ${r.institucion.codigo_dane}   ·   Sede: ${r.sede ? `${r.sede.nombre} (DANE ${r.sede.codigo_dane})` : 'Todas las sedes'}   ·   Jornada: ${r.jornada ?? 'Todas las jornadas'}   ·   Año lectivo: ${r.anio}`, MARGEN, doc.y + 2, { width: ancho });
  doc.text(`Sector (oficial / no oficial): ${LINEA}   ·   DIVIPOLA municipio: ${LINEA}   ·   DIVIPOLA departamento: ${LINEA}`, MARGEN, doc.y + 2, { width: ancho });
  doc.font('Helvetica-Oblique').fontSize(7).fillColor(r.estado_datos === 'PRELIMINAR' ? '#B26B00' : COLOR.tenue);
  doc.text(`${r.estado_datos}. Edades cumplidas al ${r.fecha_corte_edad}. ${r.leyenda}`, MARGEN, doc.y + 3, { width: ancho });
  let y = doc.y + 8;

  // --- Sección 2: balance ---
  y = seccion(doc, y, 'BALANCE GENERAL DE MATRÍCULA Y MOVIMIENTO ANUAL');
  const anchosBalance = [ancho * 0.28, ...Array(4).fill((ancho * 0.72) / 4)] as number[];
  y = tabla(
    doc,
    y,
    anchosBalance,
    [[{ t: 'Grado', izquierda: true }, { t: 'Matrícula inicial' }, { t: 'Ingresados durante el año' }, { t: 'Retirados / desertores' }, { t: 'Matrícula final' }]],
    [
      ...r.balance.filas.map((f): Celda[] => [{ t: f.grado, izquierda: true }, { t: f.matricula_inicial }, { t: f.ingresados }, { t: f.retirados }, { t: f.matricula_final }]),
      [{ t: 'Total', izquierda: true, negrita: true, fondo: COLOR.gris }, ...[r.balance.total.matricula_inicial, r.balance.total.ingresados, r.balance.total.retirados, r.balance.total.matricula_final].map((t): Celda => ({ t, negrita: true, fondo: COLOR.gris }))],
    ],
    8
  );

  // --- Sección 3: resultados ---
  const sexos: Array<'H' | 'M' | 'O'> = r.hay_otro_sin_dato ? ['H', 'M', 'O'] : ['H', 'M'];
  const etiqueta = { H: 'H', M: 'M', O: 'Otro' };
  const sub = [...sexos.map((s) => etiqueta[s]), 'Total'];
  const bloque = sub.length;
  y = seccion(doc, y + 10, 'RESULTADOS ACADÉMICOS Y EFICIENCIA INTERNA POR GRADO Y SEXO');
  const anchosResultados = [ancho * 0.16, ...Array(3 * bloque).fill((ancho * 0.76) / (3 * bloque)), ancho * 0.08] as number[];
  y = tabla(
    doc,
    y,
    anchosResultados,
    [
      [{ t: '' }, { t: 'Promovidos / aprobados', span: bloque }, { t: 'No promovidos / reprobados', span: bloque }, { t: 'Desertores / retirados', span: bloque }, { t: 'Sin resultado' }],
      [{ t: 'Grado', izquierda: true }, ...[0, 1, 2].flatMap(() => sub.map((t): Celda => ({ t }))), { t: 'final' }],
    ],
    [
      ...r.resultados.filas.map((f): Celda[] => [{ t: f.grado, izquierda: true }, ...[...conteo(f.promovidos, sexos), ...conteo(f.no_promovidos, sexos), ...conteo(f.desertores, sexos), f.sin_resultado].map((t): Celda => ({ t }))]),
      [
        { t: 'Total', izquierda: true, negrita: true, fondo: COLOR.gris },
        ...[...conteo(r.resultados.total.promovidos, sexos), ...conteo(r.resultados.total.no_promovidos, sexos), ...conteo(r.resultados.total.desertores, sexos), r.resultados.total.sin_resultado].map((t): Celda => ({ t, negrita: true, fondo: COLOR.gris })),
      ],
    ],
    7.5
  );

  // --- Sección 4: edades ---
  const porGrado = sexos.length;
  y = seccion(doc, y + 10, 'DISTRIBUCIÓN POR EDAD Y GRADO (EXTRAEDAD)');
  const anchosEdad = [ancho * 0.12, ...Array(r.grados.length * porGrado).fill((ancho * 0.84) / Math.max(1, r.grados.length * porGrado)), ancho * 0.04] as number[];
  y = tabla(
    doc,
    y,
    anchosEdad,
    [
      [{ t: '' }, ...r.grados.map((g): Celda => ({ t: g.grado, span: porGrado })), { t: '' }],
      [{ t: 'Edad', izquierda: true }, ...r.grados.flatMap(() => sexos.map((s): Celda => ({ t: etiqueta[s] }))), { t: 'Total' }],
    ],
    [
      ...r.edades.filas.map((e): Celda[] => [{ t: e.etiqueta, izquierda: true }, ...r.grados.flatMap((g) => sexos.map((s): Celda => ({ t: e.celdas[g.grado_id]?.[s] ?? 0 }))), { t: e.total.total, negrita: true }]),
      [
        { t: 'Total', izquierda: true, negrita: true, fondo: COLOR.gris },
        ...r.grados.flatMap((g) => sexos.map((s): Celda => ({ t: r.edades.total_por_grado[g.grado_id]?.[s] ?? 0, negrita: true, fondo: COLOR.gris }))),
        { t: Object.values(r.edades.total_por_grado).reduce((s, c) => s + c.total, 0), negrita: true, fondo: COLOR.gris },
      ],
    ],
    6.5
  );
  if (r.edades.sin_fecha_nacimiento > 0) {
    doc.font('Helvetica-Oblique').fontSize(7).fillColor(COLOR.tenue).text(`${r.edades.sin_fecha_nacimiento} estudiante(s) sin fecha de nacimiento no entran a esta tabla.`, MARGEN, y + 3, { width: ancho });
    y = doc.y;
  }

  // --- Firma ---
  y = seccion(doc, y + 12, 'DECLARACIÓN Y FIRMAS');
  if (y + 70 > doc.page.height - 40) {
    doc.addPage();
    y = MARGEN;
  }
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.ink).text(`${r.firma.cargo}: ${r.firma.nombre || LINEA}`, MARGEN, y, { width: ancho });
  doc.moveTo(MARGEN + 40, doc.y + 28).lineTo(MARGEN + 260, doc.y + 28).stroke(COLOR.ink);
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.cuerpo).text(`[Firma del ${r.firma.cargo}]`, MARGEN + 40, doc.y + 32, { width: 220, align: 'center' });
  doc.text(`Fecha de expedición: ${r.firma.fecha_expedicion}`, MARGEN, doc.y + 6, { width: ancho });

  // Pie con la numeración de hojas.
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);
    // El pie queda dentro del margen inferior: sin esto pdfkit abriría una hoja nueva por cada número de página.
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.tenue).text(`Hoja ${i + 1} de ${rango.count}`, MARGEN, doc.page.height - 24, { width: ancho, align: 'right', lineBreak: false });
  }
  doc.end();
  return listo;
}
