import PDFDocument from 'pdfkit';
import { Types } from 'mongoose';
import { NOMBRES_NIVEL_VALORACION, NivelValoracion } from '../constants/valoracionDescriptiva';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import Area from '../models/area.model';
import Enrollment from '../models/enrollment.model';
import Institution from '../models/institution.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
import ValoracionDescriptiva from '../models/valoracionDescriptiva.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { registrarEvento } from './audit.service';
import { COLOR, MARGEN, cargarLogo, dibujarEncabezado } from './encabezadoInstitucional.service';
import { esGrupoSinReprobacion } from './nivelesSinReprobacion.service';

type Documento = InstanceType<typeof PDFDocument>;

const PUEDEN_GENERAR = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

interface FilaInforme {
  area: string;
  asignatura: string;
  valoracion: { nivel: NivelValoracion; fortalezas: string; recomendaciones: string } | null;
}

/**
 * El informe descriptivo de un estudiante de Preescolar en un periodo: por cada asignatura o dimensión, su nivel de avance (iniciado, en proceso,
 * alcanzado) y el texto del docente. No hay notas ni promedios. Lo arma quien tiene acceso a la matrícula (sedes asignadas); lo que aún no tiene
 * valoración sale marcado como pendiente, nunca como cero.
 */
async function reunirInforme(studentId: string, anioId: string, periodo: number, usuario: UserDocument) {
  if (!PUEDEN_GENERAR.includes(usuario.rol)) throw new ApiError(403, 'No tienes acceso a los informes descriptivos.');
  const [estudiante, anio] = await Promise.all([
    Types.ObjectId.isValid(studentId) ? User.findOne({ _id: studentId, roles: ROLES.ESTUDIANTE }).select('nombre apellido numero_documento tipo_documento') : null,
    Types.ObjectId.isValid(anioId) ? AcademicYear.findById(anioId) : null,
  ]);
  if (!estudiante || !anio) throw new ApiError(404, 'Estudiante o año lectivo no encontrado.');
  if (!anio.periodos.some((p) => p.numero === periodo)) throw new ApiError(400, `El año ${anio.year} no tiene periodo ${periodo}.`);

  const matricula = await Enrollment.findOne({ student_id: estudiante._id, academic_year_id: anio._id, estado: { $in: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO', 'RETIRADO'] } })
    .populate<{ group_id: { _id: Types.ObjectId; nomenclatura: string; sede_id: { _id: Types.ObjectId; nombre: string }; jornada_id: { nombre: string }; grade_id: { nombre: string } } }>({
      path: 'group_id',
      select: 'nomenclatura sede_id jornada_id grade_id',
      populate: [{ path: 'sede_id', select: 'nombre' }, { path: 'jornada_id', select: 'nombre' }, { path: 'grade_id', select: 'nombre' }],
    })
    .sort({ createdAt: -1 });
  if (!matricula?.group_id) throw new ApiError(404, 'El estudiante no tiene matrícula en ese año.');
  const sedes = (usuario.sedes_ids ?? []).map(String);
  if (usuario.rol !== ROLES.ADMIN && !sedes.includes(String(matricula.group_id.sede_id._id))) throw new ApiError(404, 'Estudiante no encontrado.');
  if (!(await esGrupoSinReprobacion(matricula.group_id._id))) throw new ApiError(409, 'El informe descriptivo es solo de Preescolar: los demás grados usan el boletín.');

  const asignaciones = await TeacherAssignment.find({ academic_year_id: anio._id, group_id: matricula.group_id._id, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO }).select('_id subject_id');
  const asignaturas = await Subject.find({ _id: { $in: asignaciones.map((a) => a.subject_id) } }).select('nombre area_id');
  const areas = await Area.find({ _id: { $in: [...new Set(asignaturas.map((s) => String(s.area_id)))] } }).select('nombre');
  const nombreArea = new Map(areas.map((a) => [String(a._id), a.nombre]));
  const valoraciones = await ValoracionDescriptiva.find({ student_id: estudiante._id, periodo_numero: periodo, teacher_assignment_id: { $in: asignaciones.map((a) => a._id) } }).lean();
  const porAsignacion = new Map(valoraciones.map((v) => [String(v.teacher_assignment_id), v]));

  const filas: FilaInforme[] = asignaciones
    .map((a) => {
      const subject = asignaturas.find((s) => String(s._id) === String(a.subject_id));
      const v = porAsignacion.get(String(a._id));
      return { area: nombreArea.get(String(subject?.area_id)) ?? '', asignatura: subject?.nombre ?? '', valoracion: v ? { nivel: v.nivel, fortalezas: v.fortalezas, recomendaciones: v.recomendaciones } : null };
    })
    .sort((a, b) => a.area.localeCompare(b.area, 'es') || a.asignatura.localeCompare(b.asignatura, 'es'));

  return { estudiante, anio, periodo, nombrePeriodo: anio.periodos.find((p) => p.numero === periodo)?.nombre || `Periodo ${periodo}`, matricula, filas };
}

function bloqueDeFila(doc: Documento, f: FilaInforme): void {
  const ancho = doc.page.width - MARGEN * 2;
  if (doc.y > doc.page.height - 170) doc.addPage();
  doc.moveDown(0.8);
  const y = doc.y;
  doc.rect(MARGEN, y, ancho, 18).fill(COLOR.suave);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.ink).text(f.asignatura, MARGEN + 6, y + 5, { width: ancho * 0.65, lineBreak: false, ellipsis: true });
  const nivel = f.valoracion ? NOMBRES_NIVEL_VALORACION[f.valoracion.nivel] : 'Sin valoración';
  doc.font('Helvetica-Bold').fontSize(10).fillColor(f.valoracion ? COLOR.primario : COLOR.peligro).text(nivel, MARGEN + ancho * 0.65, y + 5, { width: ancho * 0.35 - 6, align: 'right', lineBreak: false });
  doc.y = y + 24;
  doc.x = MARGEN;
  if (!f.valoracion) return;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR.tenue).text('Fortalezas', MARGEN, doc.y, { width: ancho });
  doc.font('Helvetica').fontSize(10).fillColor(COLOR.cuerpo).text(f.valoracion.fortalezas, MARGEN, doc.y, { width: ancho, align: 'justify' });
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR.tenue).text('Recomendaciones', MARGEN, doc.y, { width: ancho });
  doc.font('Helvetica').fontSize(10).fillColor(COLOR.cuerpo).text(f.valoracion.recomendaciones, MARGEN, doc.y, { width: ancho, align: 'justify' });
}

export async function generarInformeDescriptivoPdf(studentId: string, anioId: string, periodo: number, usuario: UserDocument, ip?: string | null): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const datos = await reunirInforme(studentId, anioId, periodo, usuario);
  const [institucion, logo] = await Promise.all([Institution.findOne(), cargarLogo()]);
  const { estudiante, matricula, filas } = datos;

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGEN, info: { Title: `Informe descriptivo ${estudiante.apellido} ${estudiante.nombre}`, Producer: 'Klassy' } });
    const trozos: Buffer[] = [];
    doc.on('data', (t) => trozos.push(t));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);
    try {
      dibujarEncabezado(
        doc,
        {
          institucion: institucion?.nombre ?? '',
          codigo_dane: institucion?.codigo_dane ?? '',
          nit: institucion?.nit ?? '',
          resolucion_aprobacion: institucion?.resolucion_aprobacion ?? '',
          sede: matricula.group_id.sede_id.nombre,
          jornada: matricula.group_id.jornada_id.nombre,
          anio: datos.anio.year,
        },
        'Informe descriptivo de desempeño',
        datos.nombrePeriodo,
        logo
      );
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.ink).text(`${estudiante.apellido} ${estudiante.nombre}`.toUpperCase(), MARGEN, doc.y);
      doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.cuerpo).text(`Documento ${estudiante.numero_documento} · ${matricula.group_id.grade_id.nombre}, grupo ${matricula.group_id.nomenclatura} · Año lectivo ${datos.anio.year} · ${datos.nombrePeriodo}`);
      doc.moveDown(0.4);
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLOR.tenue).text('En Preescolar la evaluación es cualitativa y descriptiva: no hay notas ni promedios, y ningún niño reprueba el grado (Decreto 2247 de 1997).', MARGEN, doc.y, { width: doc.page.width - MARGEN * 2 });

      let area = '';
      for (const f of filas) {
        if (f.area !== area) {
          area = f.area;
          if (doc.y > doc.page.height - 190) doc.addPage();
          doc.moveDown(1);
          doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.primario).text(area || 'Dimensiones', MARGEN, doc.y);
        }
        bloqueDeFila(doc, f);
      }
      if (filas.length === 0) doc.moveDown(1).font('Helvetica').fontSize(10).fillColor(COLOR.tenue).text('El grupo aún no tiene asignaturas o dimensiones con docente.', MARGEN, doc.y);
      doc.end();
    } catch (err) {
      doc.end();
      reject(err);
    }
  });

  await registrarEvento({ usuario_id: usuario._id, accion: 'VALORACION_DESCRIPTIVA_INFORME_GENERADO', entidad: 'User', entidad_id: estudiante._id, detalle: `Periodo ${periodo}`, ip });
  return { buffer, nombreArchivo: `informe-descriptivo-${estudiante.numero_documento}-p${periodo}.pdf` };
}
