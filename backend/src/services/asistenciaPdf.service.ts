import { HydratedDocument, Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import { ROLES } from '../constants/roles';
import AcademicYear from '../dominios/institucional/calendario/academicYear.model';
import Enrollment from '../dominios/registro/matriculas/enrollment.model';
import Group, { IGroup } from '../dominios/institucional/estructura/group.model';
import Subject from '../dominios/curricular/plan-estudios/subject.model';
import TeacherAssignment from '../dominios/curricular/carga-docente/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { periodosEfectivos } from '../dominios/institucional';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { COLOR, Documento, bufferDeDocumento } from '../utils/pdf';
import { listarInasistencias, matriculasActivas, obtenerGrupoYAsignatura } from './attendance.service';
import { cargarContextoFechas } from '../dominios/institucional';
import { Cuadricula, TotalesEstudiante, construirCuadricula } from './attendanceCuadricula.service';
import {
  TotalesAsistencia,
  calcularEstadisticas,
  estadisticasPorGrupoYAsignatura,
  resumenAsistenciaParaBoletin,
  sumarTotales,
} from './attendanceStats.service';
import { buscarInstitucion } from '../dominios/institucional';

const MARGEN = 30;
const MARGEN_INFERIOR = 20;
const LETRA_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];


interface Pdf {
  doc: Documento;
  terminar: () => Promise<Buffer>;
}

function abrirPdf(orientacion: 'portrait' | 'landscape'): Pdf {
  const doc = new PDFDocument({
    size: 'LETTER',
    layout: orientacion,
    margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: MARGEN_INFERIOR },
    bufferPages: true,
  });
  const listo = bufferDeDocumento(doc);

  const terminar = async () => {
    const { start, count } = doc.bufferedPageRange();
    const generado = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
    for (let i = 0; i < count; i += 1) {
      doc.switchToPage(start + i);
      doc.font('Helvetica').fontSize(7).fillColor(COLOR.tenue);
      doc.text(`Generado el ${generado} · Página ${i + 1} de ${count}`, MARGEN, doc.page.height - 34, {
        width: doc.page.width - MARGEN * 2,
        align: 'right',
        lineBreak: false,
      });
    }
    doc.end();
    return listo;
  };
  return { doc, terminar };
}

const limiteInferior = (doc: Documento): number => doc.page.height - 46;
const anchoUtil = (doc: Documento): number => doc.page.width - MARGEN * 2;

function formatoFecha(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

function recortar(doc: Documento, texto: string, ancho: number): string {
  if (doc.widthOfString(texto) <= ancho) return texto;
  let corto = texto;
  while (corto.length > 1 && doc.widthOfString(`${corto}…`) > ancho) corto = corto.slice(0, -1);
  return `${corto}…`;
}

async function nombreInstitucion(): Promise<string> {
  return (await buscarInstitucion())?.nombre ?? 'Institución Educativa';
}

/** Encabezado común: institución, título y líneas de contexto. Devuelve la `y` donde sigue el contenido. */
function encabezado(doc: Documento, institucion: string, titulo: string, lineas: string[]): number {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.cuerpo).text(institucion, MARGEN, MARGEN, { width: anchoUtil(doc), lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLOR.ink).text(titulo, MARGEN, MARGEN + 16, { width: anchoUtil(doc), lineBreak: false });
  let y = MARGEN + 36;
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.cuerpo);
  for (const linea of lineas) {
    doc.text(linea, MARGEN, y, { width: anchoUtil(doc), lineBreak: false });
    y += 12;
  }
  return y + 6;
}

interface Columna {
  titulo: string;
  ancho: number;
  alinear?: 'left' | 'right' | 'center';
}

interface OpcionesTabla {
  alto?: number;
  /** Filas (por índice) que van en negrita, p. ej. el subtotal de un grado. */
  negritas?: Set<number>;
  /** Filas (por índice) con fondo suave. */
  sombreadas?: Set<number>;
}

/** Tabla genérica con encabezado azul suave que se repite en cada página. Devuelve la `y` final. */
function dibujarTabla(doc: Documento, y: number, columnas: Columna[], filas: string[][], opciones: OpcionesTabla = {}): number {
  const alto = opciones.alto ?? 16;
  const anchoTotal = columnas.reduce((suma, c) => suma + c.ancho, 0);

  const dibujarEncabezado = (posicionY: number): number => {
    doc.rect(MARGEN, posicionY, anchoTotal, alto + 4).fill(COLOR.primarioSuave);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR.primario);
    let x = MARGEN;
    for (const c of columnas) {
      doc.text(recortar(doc, c.titulo.toUpperCase(), c.ancho - 6), x + 3, posicionY + 6, { width: c.ancho - 6, align: c.alinear ?? 'left', lineBreak: false });
      x += c.ancho;
    }
    return posicionY + alto + 4;
  };

  let posicionY = dibujarEncabezado(y);
  filas.forEach((fila, i) => {
    if (posicionY + alto > limiteInferior(doc)) {
      doc.addPage();
      posicionY = dibujarEncabezado(MARGEN);
    }
    if (opciones.sombreadas?.has(i)) doc.rect(MARGEN, posicionY, anchoTotal, alto).fill(COLOR.suave);
    doc.font(opciones.negritas?.has(i) ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(COLOR.ink);
    let x = MARGEN;
    columnas.forEach((c, j) => {
      doc.text(recortar(doc, fila[j] ?? '', c.ancho - 6), x + 3, posicionY + (alto - 8) / 2 + 0.5, { width: c.ancho - 6, align: c.alinear ?? 'left', lineBreak: false });
      x += c.ancho;
    });
    doc.moveTo(MARGEN, posicionY + alto).lineTo(MARGEN + anchoTotal, posicionY + alto).lineWidth(0.4).stroke(COLOR.borde);
    posicionY += alto;
  });
  return posicionY;
}

function etiquetaMes(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number) as [number, number];
  return `${NOMBRES_MES[numero - 1]} de ${anio}`;
}

/** Los meses (YYYY-MM) que toca un rango de fechas. */
function mesesDelRango(desde: Date, hasta: Date): string[] {
  const meses: string[] = [];
  const cursor = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1));
  while (cursor <= hasta) {
    meses.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return meses;
}

// --- Planilla de asistencia (grupo + asignatura) ---

export interface ConsultaPdfPlanilla {
  group_id: string;
  subject_id: string;
  /** YYYY-MM; si no, `periodo_numero` (una hoja por cada mes del periodo y un resumen final). */
  mes?: string;
  periodo_numero?: number;
}

function dibujarHojaPlanilla(pdf: Pdf, institucion: string, cuadricula: Cuadricula, contextoPeriodo: string): void {
  const { doc } = pdf;
  const lineas = [
    `Grupo: ${cuadricula.grupo.grado} ${cuadricula.grupo.nomenclatura}     Asignatura: ${cuadricula.asignatura.nombre}     Docente: ${cuadricula.docente ?? 'sin asignar'}`,
    `${contextoPeriodo}`,
  ];
  const estadoPorId = new Map(cuadricula.estados.map((e) => [String(e._id), e]));
  const ancho = anchoUtil(doc);
  const anchoNumero = 22;
  const anchoNombre = 150;
  const anchoTotal = 26;
  const anchoDia = Math.min(22, (ancho - anchoNumero - anchoNombre - anchoTotal * 3) / Math.max(1, cuadricula.dias.length));
  const alto = cuadricula.estudiantes.length > 36 ? 13 : 15;

  let y = encabezado(doc, institucion, 'Planilla de asistencia', lineas);

  const dibujarCabecera = (posicionY: number): number => {
    const anchoTabla = anchoNumero + anchoNombre + anchoDia * cuadricula.dias.length + anchoTotal * 3;
    doc.rect(MARGEN, posicionY, anchoTabla, 26).fill(COLOR.primarioSuave);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR.primario);
    doc.text('#', MARGEN, posicionY + 9, { width: anchoNumero, align: 'center', lineBreak: false });
    doc.text('ESTUDIANTE', MARGEN + anchoNumero + 3, posicionY + 9, { width: anchoNombre - 6, lineBreak: false });
    cuadricula.dias.forEach((dia, i) => {
      const x = MARGEN + anchoNumero + anchoNombre + anchoDia * i;
      const fecha = new Date(`${dia.fecha}T00:00:00Z`);
      doc.text(LETRA_DIA[fecha.getUTCDay()] as string, x, posicionY + 3, { width: anchoDia, align: 'center', lineBreak: false });
      doc.text(String(fecha.getUTCDate()), x, posicionY + 14, { width: anchoDia, align: 'center', lineBreak: false });
    });
    const xTotales = MARGEN + anchoNumero + anchoNombre + anchoDia * cuadricula.dias.length;
    ['F', 'J', 'R'].forEach((letra, i) => {
      doc.text(letra, xTotales + anchoTotal * i, posicionY + 9, { width: anchoTotal, align: 'center', lineBreak: false });
    });
    return posicionY + 26;
  };

  y = dibujarCabecera(y);
  cuadricula.estudiantes.forEach((estudiante, i) => {
    if (y + alto > limiteInferior(doc) - 40) {
      doc.addPage();
      y = dibujarCabecera(MARGEN);
    }
    const x0 = MARGEN + anchoNumero + anchoNombre;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.tenue).text(String(i + 1), MARGEN, y + (alto - 7.5) / 2, { width: anchoNumero, align: 'center', lineBreak: false });
    doc.fillColor(COLOR.ink).text(
      recortar(doc, `${estudiante.apellido} ${estudiante.nombre}`, anchoNombre - 6),
      MARGEN + anchoNumero + 3,
      y + (alto - 7.5) / 2,
      { width: anchoNombre - 6, lineBreak: false }
    );

    cuadricula.dias.forEach((dia, j) => {
      const x = x0 + anchoDia * j;
      const celda = cuadricula.celdas[estudiante.student_id]?.[dia.fecha];
      const estado = celda ? estadoPorId.get(celda.state_id) : undefined;
      if (dia.bloqueo && !celda) doc.rect(x, y, anchoDia, alto).fill(COLOR.suave);
      else if (estado?.cuenta_como_falla) doc.rect(x, y, anchoDia, alto).fill(COLOR.peligroSuave);
      else if (estado?.es_retardo) doc.rect(x, y, anchoDia, alto).fill(COLOR.alertaSuave);
      if (estado) {
        const justificada = estado.cuenta_como_falla && celda?.justificacion === 'APROBADA' && !estado.es_justificada;
        doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR.ink).text(`${estado.abreviatura}${justificada ? '*' : ''}`, x, y + (alto - 7) / 2, {
          width: anchoDia,
          align: 'center',
          lineBreak: false,
        });
      }
    });

    const totales = cuadricula.totales[estudiante.student_id] as TotalesEstudiante;
    const xTotales = x0 + anchoDia * cuadricula.dias.length;
    [totales.fallas, totales.fallas_justificadas, totales.retardos].forEach((valor, k) => {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR.ink).text(String(valor), xTotales + anchoTotal * k, y + (alto - 7.5) / 2, {
        width: anchoTotal,
        align: 'center',
        lineBreak: false,
      });
    });

    const anchoTabla = anchoNumero + anchoNombre + anchoDia * cuadricula.dias.length + anchoTotal * 3;
    doc.moveTo(MARGEN, y + alto).lineTo(MARGEN + anchoTabla, y + alto).lineWidth(0.4).stroke(COLOR.borde);
    y += alto;
  });

  // Convenciones y firma al pie de la hoja.
  y += 10;
  doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.cuerpo);
  const leyenda = cuadricula.estados
    .filter((e) => e.estado === 'activo')
    .map((e) => `${e.abreviatura} = ${e.nombre}`)
    .join('    ');
  doc.text(`${leyenda}    * = falla con justificación aprobada    F = fallas    J = justificadas    R = retardos`, MARGEN, y, { width: ancho, lineBreak: false });
  y += 26;
  doc.moveTo(MARGEN, y + 12).lineTo(MARGEN + 200, y + 12).lineWidth(0.6).stroke(COLOR.cuerpo);
  doc.text('Firma del docente', MARGEN, y + 15, { width: 200, lineBreak: false });
}

function sumarTotalesPorEstudiante(cuadriculas: Cuadricula[]): Map<string, TotalesEstudiante> {
  const suma = new Map<string, TotalesEstudiante>();
  for (const cuadricula of cuadriculas) {
    for (const [studentId, total] of Object.entries(cuadricula.totales)) {
      const actual = suma.get(studentId) ?? { asistencias: 0, retardos: 0, fallas: 0, fallas_justificadas: 0 };
      actual.asistencias += total.asistencias;
      actual.retardos += total.retardos;
      actual.fallas += total.fallas;
      actual.fallas_justificadas += total.fallas_justificadas;
      suma.set(studentId, actual);
    }
  }
  return suma;
}

/** La planilla clásica lista para imprimir y firmar: de un mes, o de un periodo (una hoja por mes y un resumen final). */
export async function generarPdfPlanilla(consulta: ConsultaPdfPlanilla, usuario: UserDocument): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const { grupo, asignatura } = await obtenerGrupoYAsignatura(consulta.group_id, consulta.subject_id);
  const institucion = await nombreInstitucion();
  const pdf = abrirPdf('landscape');
  const base = { group_id: consulta.group_id, subject_id: consulta.subject_id };

  if (consulta.mes) {
    const cuadricula = await construirCuadricula({ ...base, mes: consulta.mes }, usuario);
    dibujarHojaPlanilla(pdf, institucion, cuadricula, `Mes: ${etiquetaMes(consulta.mes)}`);
    return { buffer: await pdf.terminar(), nombreArchivo: nombreArchivo('planilla', cuadricula.grupo.grado, grupo.nomenclatura, asignatura.nombre, consulta.mes) };
  }

  const contexto = await cargarContextoFechas(grupo);
  const calendarioSede = contexto.anio.calendarios_sede.find((c) => String(c.sede_id) === String(grupo.sede_id));
  const periodo = periodosEfectivos(contexto.anio.periodos, calendarioSede).find((p) => p.numero === consulta.periodo_numero);
  if (!periodo) throw new ApiError(404, `El año lectivo ${contexto.anio.year} no tiene periodo ${consulta.periodo_numero}.`);

  const cuadriculas: Cuadricula[] = [];
  for (const mes of mesesDelRango(periodo.fecha_inicio, periodo.fecha_fin)) {
    const cuadricula = await construirCuadricula({ ...base, mes, rango: { desde: periodo.fecha_inicio, hasta: periodo.fecha_fin } }, usuario);
    if (cuadricula.dias.length === 0) continue;
    if (cuadriculas.length > 0) pdf.doc.addPage();
    cuadriculas.push(cuadricula);
    dibujarHojaPlanilla(pdf, institucion, cuadricula, `Periodo ${periodo.numero} · ${etiquetaMes(mes)}`);
  }
  if (cuadriculas.length === 0) throw new ApiError(404, 'El periodo no tiene días de clase para esta jornada.');

  const primera = cuadriculas[0] as Cuadricula;
  const acumulado = sumarTotalesPorEstudiante(cuadriculas);
  pdf.doc.addPage();
  const y = encabezado(pdf.doc, institucion, `Resumen del periodo ${periodo.numero}`, [
    `Grupo: ${primera.grupo.grado} ${primera.grupo.nomenclatura}     Asignatura: ${primera.asignatura.nombre}     Docente: ${primera.docente ?? 'sin asignar'}`,
  ]);
  dibujarTabla(
    pdf.doc,
    y,
    [
      { titulo: '#', ancho: 28, alinear: 'center' },
      { titulo: 'Estudiante', ancho: 250 },
      { titulo: 'Documento', ancho: 90 },
      { titulo: 'Fallas', ancho: 70, alinear: 'right' },
      { titulo: 'Justificadas', ancho: 80, alinear: 'right' },
      { titulo: 'Injustificadas', ancho: 90, alinear: 'right' },
      { titulo: 'Retardos', ancho: 70, alinear: 'right' },
    ],
    primera.estudiantes.map((e, i) => {
      const t = acumulado.get(e.student_id) ?? { asistencias: 0, retardos: 0, fallas: 0, fallas_justificadas: 0 };
      return [String(i + 1), `${e.apellido} ${e.nombre}`, e.numero_documento, String(t.fallas), String(t.fallas_justificadas), String(t.fallas - t.fallas_justificadas), String(t.retardos)];
    })
  );
  return { buffer: await pdf.terminar(), nombreArchivo: nombreArchivo('planilla', primera.grupo.grado, grupo.nomenclatura, asignatura.nombre, `periodo-${periodo.numero}`) };
}

function nombreArchivo(...partes: string[]): string {
  return `${partes.join('-')}.pdf`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-');
}

// --- Consolidado de un grupo (todas las asignaturas) ---

async function nombreDelGradoDe(grupo: HydratedDocument<IGroup>): Promise<string> {
  const poblado = await Group.findById(grupo._id).populate<{ grade_id: { nombre: string } | null }>('grade_id', 'nombre');
  return poblado?.grade_id?.nombre ?? '';
}

/** Por estudiante: fallas por asignatura y totales del grupo. Lo sacan ADMIN/COORDINADOR y el director del grupo. */
export async function generarPdfConsolidadoGrupo(
  consulta: { group_id: string; periodo_numero?: number },
  usuario: UserDocument
): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const grupo = await Group.findById(consulta.group_id);
  if (!grupo) throw new ApiError(404, 'Grupo no encontrado.');
  const esDirector = grupo.director_grupo_id && String(grupo.director_grupo_id) === String(usuario._id);
  const puede = usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR || (usuario.rol === ROLES.DOCENTE && esDirector);
  if (!puede) throw new ApiError(403, 'Solo coordinación o el director del grupo pueden sacar el consolidado.');

  const anioId = String(grupo.academic_year_id);
  const [institucion, anio, grado, asignaciones, matriculas, estadisticas, resumen] = await Promise.all([
    nombreInstitucion(),
    AcademicYear.findById(anioId),
    nombreDelGradoDe(grupo),
    TeacherAssignment.find({ group_id: grupo._id, academic_year_id: anioId, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO }).select('subject_id'),
    matriculasActivas(grupo._id),
    calcularEstadisticas({ academic_year_id: anioId, agrupar_por: 'estudiante', group_id: String(grupo._id), periodo_numero: consulta.periodo_numero }, null),
    resumenAsistenciaParaBoletin(grupo._id, consulta.periodo_numero),
  ]);
  const asignaturas = (await Subject.find({ _id: { $in: asignaciones.map((a) => a.subject_id) } }).select('nombre abreviatura')).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es')
  );
  const totalesDe = new Map(estadisticas.filas.map((f) => [f.clave, f]));

  const pdf = abrirPdf('landscape');
  const alcance = consulta.periodo_numero ? `Periodo ${consulta.periodo_numero}` : 'Todos los periodos';
  const y = encabezado(pdf.doc, institucion, 'Consolidado de asistencia del grupo', [
    `Grupo: ${grado} ${grupo.nomenclatura}     Año lectivo: ${anio?.year ?? ''}     ${alcance}`,
    'Fallas por asignatura (justificadas e injustificadas) y totales del estudiante.',
  ]);

  const anchoNombre = 150;
  const anchoTotal = 38;
  const anchoAsignatura = Math.max(24, Math.min(44, (anchoUtil(pdf.doc) - anchoNombre - anchoTotal * 5) / Math.max(1, asignaturas.length)));
  const columnas: Columna[] = [
    { titulo: 'Estudiante', ancho: anchoNombre },
    ...asignaturas.map((a): Columna => ({ titulo: a.abreviatura, ancho: anchoAsignatura, alinear: 'center' })),
    { titulo: 'Fallas', ancho: anchoTotal, alinear: 'right' },
    { titulo: 'Just.', ancho: anchoTotal, alinear: 'right' },
    { titulo: 'Injust.', ancho: anchoTotal, alinear: 'right' },
    { titulo: 'Ret.', ancho: anchoTotal, alinear: 'right' },
    { titulo: '% aus.', ancho: anchoTotal, alinear: 'right' },
  ];
  const filas = matriculas.map((m) => {
    const id = String(m.student_id._id);
    const t = totalesDe.get(id);
    return [
      `${m.student_id.apellido} ${m.student_id.nombre}`,
      ...asignaturas.map((a) => String(resumen.fallasPorAsignatura.get(`${String(a._id)}_${id}`) ?? 0)),
      String(t?.fallas ?? 0),
      String(t?.fallas_justificadas ?? 0),
      String(t?.fallas_injustificadas ?? 0),
      String(t?.retardos ?? 0),
      `${t?.porcentaje_ausentismo ?? 0}%`,
    ];
  });
  let yFinal = dibujarTabla(pdf.doc, y, columnas, filas, { alto: 14 });

  yFinal += 10;
  if (yFinal + 30 > limiteInferior(pdf.doc)) {
    pdf.doc.addPage();
    yFinal = MARGEN;
  }
  pdf.doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.cuerpo);
  pdf.doc.text(asignaturas.map((a) => `${a.abreviatura} = ${a.nombre}`).join('    '), MARGEN, yFinal, { width: anchoUtil(pdf.doc), lineBreak: true });

  return { buffer: await pdf.terminar(), nombreArchivo: nombreArchivo('consolidado', grado, grupo.nomenclatura, consulta.periodo_numero ? `periodo-${consulta.periodo_numero}` : 'anio') };
}

// --- Reporte institucional: por grado, por asignatura y matriz grado x asignatura ---

function filaDeTotales(etiqueta: string, t: TotalesAsistencia): string[] {
  return [etiqueta, String(t.total_registros), String(t.asistencias), String(t.retardos), String(t.fallas), String(t.fallas_justificadas), String(t.fallas_injustificadas), `${t.porcentaje_ausentismo}%`];
}

const COLUMNAS_RESUMEN = (primera: string): Columna[] => [
  { titulo: primera, ancho: 230 },
  { titulo: 'Registros', ancho: 70, alinear: 'right' },
  { titulo: 'Asistencias', ancho: 75, alinear: 'right' },
  { titulo: 'Retardos', ancho: 65, alinear: 'right' },
  { titulo: 'Fallas', ancho: 55, alinear: 'right' },
  { titulo: 'Justificadas', ancho: 75, alinear: 'right' },
  { titulo: 'Injustificadas', ancho: 85, alinear: 'right' },
  { titulo: '% ausentismo', ancho: 75, alinear: 'right' },
];

/** Ausentismo de toda la institución: por grado (con sus grupos), por asignatura y cruzado grado x asignatura. Solo ADMIN/COORDINADOR. */
export async function generarPdfReporteInstitucional(
  consulta: { academic_year_id: string; periodo_numero?: number },
  usuario: UserDocument
): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  if (usuario.rol !== ROLES.ADMIN && usuario.rol !== ROLES.COORDINADOR) {
    throw new ApiError(403, 'Solo administración o coordinación pueden sacar el reporte institucional.');
  }
  const anio = await AcademicYear.findById(consulta.academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');

  const [institucion, filas, grupos, asignaturas] = await Promise.all([
    nombreInstitucion(),
    estadisticasPorGrupoYAsignatura(consulta.academic_year_id, consulta.periodo_numero),
    Group.find({ academic_year_id: consulta.academic_year_id }).populate<{ grade_id: { _id: Types.ObjectId; nombre: string; numero: number } | null }>('grade_id', 'nombre numero'),
    Subject.find().select('nombre'),
  ]);
  const grupoPorId = new Map(grupos.map((g) => [String(g._id), g]));
  const asignaturaPorId = new Map(asignaturas.map((a) => [String(a._id), a.nombre]));

  type Dato = { grupoId: string; gradoId: string; gradoNombre: string; gradoNumero: number; nomenclatura: string; asignaturaId: string; totales: TotalesAsistencia };
  const datos: Dato[] = filas.flatMap((fila) => {
    const grupo = grupoPorId.get(fila.group_id);
    if (!grupo) return [];
    return [{
      grupoId: fila.group_id,
      gradoId: String(grupo.grade_id?._id ?? ''),
      gradoNombre: grupo.grade_id?.nombre ?? 'Sin grado',
      gradoNumero: grupo.grade_id?.numero ?? 0,
      nomenclatura: grupo.nomenclatura,
      asignaturaId: fila.subject_id,
      totales: fila,
    }];
  });

  const pdf = abrirPdf('landscape');
  const alcance = consulta.periodo_numero ? `Periodo ${consulta.periodo_numero}` : 'Todos los periodos';
  const contexto = [`Año lectivo: ${anio.year}     ${alcance}`];

  // 1. Por grado, con el detalle de sus grupos.
  let y = encabezado(pdf.doc, institucion, 'Reporte de asistencia por grado', contexto);
  const grados = [...new Map(datos.map((d) => [d.gradoId, d])).values()].sort((a, b) => a.gradoNumero - b.gradoNumero);
  const filasGrado: string[][] = [];
  const negritas = new Set<number>();
  const sombreadas = new Set<number>();
  for (const grado of grados) {
    const delGrado = datos.filter((d) => d.gradoId === grado.gradoId);
    negritas.add(filasGrado.length);
    sombreadas.add(filasGrado.length);
    filasGrado.push(filaDeTotales(grado.gradoNombre, sumarTotales(delGrado.map((d) => d.totales))));
    const idsGrupos = [...new Set(delGrado.map((d) => d.grupoId))].sort((a, b) => (grupoPorId.get(a)?.nomenclatura ?? '').localeCompare(grupoPorId.get(b)?.nomenclatura ?? '', 'es'));
    for (const idGrupo of idsGrupos) {
      filasGrado.push(filaDeTotales(`      Grupo ${grupoPorId.get(idGrupo)?.nomenclatura ?? ''}`, sumarTotales(delGrado.filter((d) => d.grupoId === idGrupo).map((d) => d.totales))));
    }
  }
  if (filasGrado.length === 0) filasGrado.push(['Todavía no hay asistencia registrada.', '', '', '', '', '', '', '']);
  y = dibujarTabla(pdf.doc, y, COLUMNAS_RESUMEN('Grado / grupo'), filasGrado, { negritas, sombreadas });

  // 2. Por asignatura (en toda la institución).
  pdf.doc.addPage();
  y = encabezado(pdf.doc, institucion, 'Reporte de asistencia por asignatura', contexto);
  const idsAsignaturas = [...new Set(datos.map((d) => d.asignaturaId))].sort((a, b) => (asignaturaPorId.get(a) ?? '').localeCompare(asignaturaPorId.get(b) ?? '', 'es'));
  const filasAsignatura = idsAsignaturas.map((id) => filaDeTotales(asignaturaPorId.get(id) ?? 'Asignatura', sumarTotales(datos.filter((d) => d.asignaturaId === id).map((d) => d.totales))));
  if (filasAsignatura.length === 0) filasAsignatura.push(['Todavía no hay asistencia registrada.', '', '', '', '', '', '', '']);
  y = dibujarTabla(pdf.doc, y, COLUMNAS_RESUMEN('Asignatura'), filasAsignatura);

  // 3. Matriz grado x asignatura: porcentaje de ausentismo.
  pdf.doc.addPage();
  y = encabezado(pdf.doc, institucion, 'Ausentismo por grado y asignatura (%)', [...contexto, 'Cada celda es el porcentaje de registros que fueron falla; "—" si no hay registros.']);
  const anchoGrado = Math.max(34, Math.min(60, (anchoUtil(pdf.doc) - 170) / Math.max(1, grados.length)));
  const columnasMatriz: Columna[] = [{ titulo: 'Asignatura', ancho: 170 }, ...grados.map((g): Columna => ({ titulo: g.gradoNombre, ancho: anchoGrado, alinear: 'center' }))];
  const filasMatriz = idsAsignaturas.map((idAsignatura) => [
    asignaturaPorId.get(idAsignatura) ?? 'Asignatura',
    ...grados.map((g) => {
      const celda = datos.filter((d) => d.asignaturaId === idAsignatura && d.gradoId === g.gradoId);
      return celda.length === 0 ? '—' : `${sumarTotales(celda.map((d) => d.totales)).porcentaje_ausentismo}%`;
    }),
  ]);
  if (filasMatriz.length === 0) filasMatriz.push(['Todavía no hay asistencia registrada.']);
  dibujarTabla(pdf.doc, y, columnasMatriz, filasMatriz);

  return { buffer: await pdf.terminar(), nombreArchivo: nombreArchivo('reporte-asistencia', String(anio.year), consulta.periodo_numero ? `periodo-${consulta.periodo_numero}` : 'anio') };
}

// --- Ficha de un estudiante ---

/** El historial de inasistencias de un estudiante con su justificación. ADMIN, COORDINADOR y SECRETARIA. */
export async function generarPdfFichaEstudiante(
  consulta: { student_id: string; academic_year_id: string; periodo_numero?: number },
  usuario: UserDocument
): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  if (![ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA].includes(usuario.rol as never)) {
    throw new ApiError(403, 'No tiene permisos para sacar la ficha de asistencia de un estudiante.');
  }
  const [estudiante, anio, institucion] = await Promise.all([
    User.findById(consulta.student_id),
    AcademicYear.findById(consulta.academic_year_id),
    nombreInstitucion(),
  ]);
  if (!estudiante) throw new ApiError(404, 'Estudiante no encontrado.');
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');

  const matricula = await Enrollment.findOne({
    student_id: estudiante._id,
    academic_year_id: anio._id,
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  }).populate<{ group_id: { _id: Types.ObjectId; nomenclatura: string } | null }>('group_id', 'nomenclatura');

  const [estadisticas, inasistencias] = await Promise.all([
    calcularEstadisticas({ academic_year_id: consulta.academic_year_id, agrupar_por: 'estudiante', student_id: consulta.student_id, periodo_numero: consulta.periodo_numero }, null),
    listarInasistencias({ student_id: consulta.student_id, academic_year_id: consulta.academic_year_id, periodo_numero: consulta.periodo_numero }, usuario),
  ]);
  const totales = estadisticas.filas[0] ?? sumarTotales([]);

  const grupo = matricula?.group_id ? await Group.findById(matricula.group_id._id) : null;
  const grupoDelEstudiante = grupo ? `${await nombreDelGradoDe(grupo)} ${grupo.nomenclatura}` : 'sin matrícula activa';

  const pdf = abrirPdf('portrait');
  const alcance = consulta.periodo_numero ? `Periodo ${consulta.periodo_numero}` : 'Todos los periodos';
  const y = encabezado(pdf.doc, institucion, 'Ficha de asistencia del estudiante', [
    `Estudiante: ${estudiante.apellido} ${estudiante.nombre}     Documento: ${estudiante.numero_documento}`,
    `Grupo: ${grupoDelEstudiante}     Año lectivo: ${anio.year}     ${alcance}`,
    `Registros: ${totales.total_registros}     Fallas: ${totales.fallas} (justificadas ${totales.fallas_justificadas}, injustificadas ${totales.fallas_injustificadas})     Retardos: ${totales.retardos}     Ausentismo: ${totales.porcentaje_ausentismo}%`,
  ]);

  const filas = inasistencias.map((i) => [
    formatoFecha(new Date(i.fecha).toISOString()),
    String(i.periodo_numero),
    i.asignatura,
    i.estado.nombre,
    i.novedad || '—',
    i.justificacion ? { PENDIENTE: 'En revisión', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada' }[i.justificacion.estado] : i.estado.es_justificada ? 'Estado justificado' : 'Sin justificar',
  ]);
  if (filas.length === 0) filas.push(['Sin inasistencias registradas.', '', '', '', '', '']);
  dibujarTabla(
    pdf.doc,
    y,
    [
      { titulo: 'Fecha', ancho: 62 },
      { titulo: 'Per.', ancho: 28, alinear: 'center' },
      { titulo: 'Asignatura', ancho: 120 },
      { titulo: 'Estado', ancho: 70 },
      { titulo: 'Novedad', ancho: 170 },
      { titulo: 'Justificación', ancho: 82 },
    ],
    filas
  );

  return { buffer: await pdf.terminar(), nombreArchivo: nombreArchivo('ficha-asistencia', estudiante.apellido, estudiante.nombre, String(anio.year)) };
}
