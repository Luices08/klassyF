import PDFDocument from 'pdfkit';
import { NOMBRES_ESTADO_NOTA } from '../constants/notas';
import AcademicYear from '../models/academicYear.model';
import Group from '../models/group.model';
import Institution from '../models/institution.model';
import { UserDocument } from '../models/user.model';
import { cargarLogo, COLOR } from './encabezadoInstitucional.service';
import { obtenerPlanilla, Planilla } from './notas.service';

const MARGEN = 30;
const ALTO_FILA = 15;
const ANCHO_ESTUDIANTE = 150;
const ANCHO_NUMERO = 18;

interface ColumnaPdf {
  titulo: string;
  ancho: number;
  alineacion: 'left' | 'center';
  bloque: string;
  /** Texto de la celda de un estudiante. */
  celda: (fila: Planilla['estudiantes'][number]) => string;
  negrita?: boolean;
  fondo?: string;
}

const nota = (n: number | null | undefined): string => (n === null || n === undefined ? '' : n.toFixed(2));

/**
 * La planilla de la clase en papel, con la plantilla del colegio: encabezado (logo, título y subtítulo), las columnas que
 * el colegio quiso ver, la leyenda de las actividades y el espacio para las firmas. Es una foto de la pantalla: lo que se
 * imprime es lo que la planilla muestra (una nota cerrada, tal como se congeló).
 */
export async function generarPdfPlanilla(
  asignacionId: string,
  periodoNumero: number,
  usuario: UserDocument
): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const planilla = await obtenerPlanilla(asignacionId, periodoNumero, usuario);
  const { plantilla, asignacion } = planilla;

  const [institucion, grupo, anio, logo] = await Promise.all([
    Institution.findOne().select('nombre codigo_dane nit resolucion_aprobacion').lean(),
    asignacion?.grupo ? Group.findById(asignacion.grupo._id).populate<{ sede_id: { nombre: string } }>('sede_id', 'nombre').populate<{ jornada_id: { nombre: string } }>('jornada_id', 'nombre').lean() : null,
    asignacion ? AcademicYear.findById(asignacion.academic_year_id).select('year').lean() : null,
    plantilla.mostrar_logo ? cargarLogo() : Promise.resolve(null),
  ]);

  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: 36 }, bufferPages: true });
  const partes: Buffer[] = [];
  doc.on('data', (parte: Buffer) => partes.push(parte));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  const anchoUtil = doc.page.width - MARGEN * 2;

  // --- Encabezado ---
  const inicioY = doc.y;
  let xTexto = MARGEN;
  if (logo) {
    try {
      doc.image(logo, MARGEN, inicioY, { fit: [44, 44] });
      xTexto = MARGEN + 54;
    } catch {
      // Logo ilegible: la planilla no depende de él.
    }
  }
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.ink).text(institucion?.nombre ?? 'Institución educativa', xTexto, inicioY, { width: anchoUtil - (xTexto - MARGEN) });
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.tenue);
  const datosInstitucion = [institucion?.codigo_dane && `DANE ${institucion.codigo_dane}`, institucion?.nit && `NIT ${institucion.nit}`, institucion?.resolucion_aprobacion && `Res. ${institucion.resolucion_aprobacion}`].filter(Boolean).join(' · ');
  if (datosInstitucion) doc.text(datosInstitucion, xTexto, doc.y, { width: anchoUtil });
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR.ink).text(plantilla.titulo, xTexto, doc.y + 2, { width: anchoUtil - (xTexto - MARGEN) });
  if (plantilla.subtitulo) doc.font('Helvetica').fontSize(9).fillColor(COLOR.cuerpo).text(plantilla.subtitulo, xTexto, doc.y, { width: anchoUtil - (xTexto - MARGEN) });
  doc.y = Math.max(doc.y, inicioY + 48);

  const docente = asignacion?.docente ? `${asignacion.docente.nombre} ${asignacion.docente.apellido}` : '—';
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.cuerpo);
  doc.text(
    [
      `Asignatura: ${asignacion?.asignatura?.nombre ?? '—'}`,
      `Grupo: ${asignacion?.grupo?.nomenclatura ?? '—'}${asignacion?.grado ? ` (${asignacion.grado.nombre})` : ''}`,
      `Periodo ${planilla.periodo.numero}`,
      anio ? `Año lectivo ${anio.year}` : '',
      grupo ? `Sede ${grupo.sede_id?.nombre ?? ''} · Jornada ${(grupo.jornada_id?.nombre ?? '').toLowerCase()}` : '',
      `Docente: ${docente}`,
    ]
      .filter(Boolean)
      .join('   ·   '),
    MARGEN,
    doc.y + 2,
    { width: anchoUtil }
  );
  const estados = (Object.keys(planilla.resumen) as Array<keyof typeof planilla.resumen>)
    .filter((e) => planilla.resumen[e] > 0)
    .map((e) => `${planilla.resumen[e]} ${NOMBRES_ESTADO_NOTA[e].toLowerCase()}`)
    .join(', ');
  doc.fillColor(COLOR.tenue).text(`Estado de la planilla: ${estados || 'sin estudiantes'}`, MARGEN, doc.y + 1, { width: anchoUtil });
  doc.moveDown(0.6);

  // --- Columnas según la plantilla ---
  const columnasNota: ColumnaPdf[] = [];
  const leyenda: string[] = [];
  let numeroActividad = 0;
  for (const bloque of planilla.bloques) {
    const nombreBloque = `${bloque.nombre} ${bloque.porcentaje}%`;
    for (const casilla of bloque.casillas) {
      numeroActividad += 1;
      leyenda.push(`N${numeroActividad} = ${casilla.titulo}${plantilla.columnas.pesos ? ` (${casilla.peso_efectivo}% del bloque)` : ''}`);
      columnasNota.push({ titulo: `N${numeroActividad}`, ancho: 0, alineacion: 'center', bloque: nombreBloque, celda: (f) => nota(f.notas[casilla.id]) });
    }
    if (plantilla.columnas.promedios_componente && bloque.casillas.length > 0) {
      columnasNota.push({ titulo: 'Prom.', ancho: 0, alineacion: 'center', bloque: nombreBloque, celda: (f) => nota(f.bloques[bloque.clave]), fondo: COLOR.suave });
    }
    if (bloque.casillas.length === 0) columnasNota.push({ titulo: '—', ancho: 0, alineacion: 'center', bloque: nombreBloque, celda: () => '' });
  }

  const columnasFinales: ColumnaPdf[] = [
    { titulo: 'Nota', ancho: 40, alineacion: 'center', bloque: '', celda: (f) => nota(f.nota_asignatura), negrita: true, fondo: COLOR.suave },
    ...(plantilla.columnas.desempeno ? [{ titulo: 'Desempeño', ancho: 56, alineacion: 'center' as const, bloque: '', celda: (f: Planilla['estudiantes'][number]) => f.desempeno?.etiqueta ?? '', fondo: COLOR.suave }] : []),
    ...(plantilla.columnas.estado ? [{ titulo: 'Estado', ancho: 56, alineacion: 'center' as const, bloque: '', celda: (f: Planilla['estudiantes'][number]) => NOMBRES_ESTADO_NOTA[f.estado], fondo: COLOR.suave }] : []),
  ];

  const anchoFijo = ANCHO_NUMERO + ANCHO_ESTUDIANTE + columnasFinales.reduce((t, c) => t + c.ancho, 0);
  const anchoNota = Math.max(22, Math.min(46, (anchoUtil - anchoFijo) / Math.max(columnasNota.length, 1)));
  for (const c of columnasNota) c.ancho = anchoNota;
  const columnas: ColumnaPdf[] = [
    { titulo: '#', ancho: ANCHO_NUMERO, alineacion: 'center', bloque: '', celda: () => '' },
    { titulo: 'Estudiante', ancho: ANCHO_ESTUDIANTE, alineacion: 'left', bloque: '', celda: () => '' },
    ...columnasNota,
    ...columnasFinales,
  ];
  const anchoTabla = columnas.reduce((t, c) => t + c.ancho, 0);

  const texto = (valor: string, x: number, y: number, ancho: number, alineacion: 'left' | 'center', negrita = false, color: string = COLOR.cuerpo) => {
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(color).text(valor, x + 2, y + 4, { width: ancho - 4, align: alineacion, lineBreak: false, ellipsis: true });
  };

  const dibujarEncabezadoTabla = (y: number): number => {
    doc.rect(MARGEN, y, anchoTabla, ALTO_FILA * 2).fill('#EAF3FF');
    // Fila de bloques: un rótulo por grupo de columnas contiguas del mismo bloque.
    let x = MARGEN;
    let i = 0;
    while (i < columnas.length) {
      const bloque = (columnas[i] as ColumnaPdf).bloque;
      let ancho = 0;
      let j = i;
      while (j < columnas.length && (columnas[j] as ColumnaPdf).bloque === bloque) {
        ancho += (columnas[j] as ColumnaPdf).ancho;
        j += 1;
      }
      if (bloque) texto(bloque, x, y, ancho, 'center', true, COLOR.primario);
      x += ancho;
      i = j;
    }
    x = MARGEN;
    for (const c of columnas) {
      texto(c.titulo, x, y + ALTO_FILA, c.ancho, c.alineacion, true, COLOR.ink);
      x += c.ancho;
    }
    doc.rect(MARGEN, y, anchoTabla, ALTO_FILA * 2).lineWidth(0.5).stroke(COLOR.borde);
    return y + ALTO_FILA * 2;
  };

  let y = dibujarEncabezadoTabla(doc.y);
  const limite = doc.page.height - 36 - ALTO_FILA;
  planilla.estudiantes.forEach((fila, indice) => {
    if (y > limite) {
      doc.addPage();
      y = dibujarEncabezadoTabla(MARGEN);
    }
    let x = MARGEN;
    columnas.forEach((c, k) => {
      if (c.fondo) doc.rect(x, y, c.ancho, ALTO_FILA).fill(c.fondo);
      const contenido = k === 0 ? String(indice + 1) : k === 1 ? `${fila.estudiante.apellido} ${fila.estudiante.nombre}${plantilla.columnas.documento ? ` · ${fila.estudiante.numero_documento}` : ''}` : c.celda(fila);
      texto(contenido, x, y, c.ancho, c.alineacion, Boolean(c.negrita));
      x += c.ancho;
    });
    doc.moveTo(MARGEN, y + ALTO_FILA).lineTo(MARGEN + anchoTabla, y + ALTO_FILA).lineWidth(0.4).stroke(COLOR.borde);
    y += ALTO_FILA;
  });
  doc.rect(MARGEN, y - ALTO_FILA * planilla.estudiantes.length, anchoTabla, ALTO_FILA * planilla.estudiantes.length).lineWidth(0.5).stroke(COLOR.borde);

  // --- Leyenda, pie y firmas ---
  doc.x = MARGEN;
  doc.y = y + 8;
  if (leyenda.length > 0) {
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.tenue).text(leyenda.join('   ·   '), MARGEN, doc.y, { width: anchoUtil });
  }
  if (plantilla.pie) doc.moveDown(0.4).font('Helvetica-Oblique').fontSize(8).fillColor(COLOR.cuerpo).text(plantilla.pie, MARGEN, doc.y, { width: anchoUtil });

  if (plantilla.firmas.length > 0) {
    if (doc.y + 70 > doc.page.height - 40) doc.addPage();
    const yFirma = doc.y + 34;
    const ancho = (anchoUtil - 30 * (plantilla.firmas.length - 1)) / plantilla.firmas.length;
    plantilla.firmas.forEach((firma, i) => {
      const x = MARGEN + i * (ancho + 30);
      doc.moveTo(x, yFirma).lineTo(x + ancho, yFirma).lineWidth(0.6).stroke(COLOR.cuerpo);
      const nombre = firma.usa_docente ? docente : firma.nombre;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.ink).text(nombre || ' ', x, yFirma + 3, { width: ancho, align: 'center', lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.tenue).text(firma.cargo, x, yFirma + 14, { width: ancho, align: 'center', lineBreak: false });
    });
  }

  // --- Pie de cada página ---
  const { start, count } = doc.bufferedPageRange();
  const generado = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
  for (let i = 0; i < count; i += 1) {
    doc.switchToPage(start + i);
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.tenue).text(`Generado el ${generado} · Página ${i + 1} de ${count}`, MARGEN, doc.page.height - 26, { width: anchoUtil, align: 'right', lineBreak: false });
  }
  doc.end();

  const nombreArchivo = `planilla-${asignacion?.asignatura?.nombre ?? 'clase'}-${asignacion?.grupo?.nomenclatura ?? ''}-periodo-${periodoNumero}.pdf`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-');
  return { buffer: await listo, nombreArchivo };
}
