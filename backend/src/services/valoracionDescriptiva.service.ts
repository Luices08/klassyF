import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { MAX_CARACTERES_DESCRIPTOR, MAX_ESTUDIANTES_POR_GUARDADO, MIN_CARACTERES_DESCRIPTOR, NIVELES_VALORACION, NivelValoracion } from '../constants/valoracionDescriptiva';
import AcademicYear from '../models/academicYear.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import Subject from '../models/subject.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ValoracionDescriptiva from '../models/valoracionDescriptiva.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { asignacionDelDocente } from './activity.service';
import { registrarEvento } from './audit.service';
import { esGrupoSinReprobacion } from './nivelesSinReprobacion.service';
import { assertPeriodNotLocked } from './periodLock.service';

export interface ValoracionEntrada {
  student_id: string;
  nivel: NivelValoracion;
  fortalezas: string;
  recomendaciones: string;
}

export interface FilaPlanillaDescriptiva {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  valoracion: { nivel: NivelValoracion; fortalezas: string; recomendaciones: string } | null;
}

export interface PlanillaDescriptiva {
  asignatura: string;
  grupo: string;
  periodo_numero: number;
  /** Si el periodo admite registrar (año vigente, periodo abierto y planilla sin cerrar); si no, dice por qué. */
  editable: boolean;
  motivo_no_editable: string | null;
  filas: FilaPlanillaDescriptiva[];
}

type Estudiante = { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string };

async function cargarAsignacion(id: string, usuario: UserDocument): Promise<TeacherAssignmentDocument> {
  if (usuario.rol === ROLES.DOCENTE) return asignacionDelDocente(id, usuario);
  if (usuario.rol !== ROLES.ADMIN && usuario.rol !== ROLES.COORDINADOR) throw new ApiError(403, 'No tienes acceso a las valoraciones descriptivas.');
  const asignacion = Types.ObjectId.isValid(id) ? await TeacherAssignment.findById(id) : null;
  if (!asignacion || asignacion.tipo_asignacion !== 'CLASE' || !asignacion.group_id || !asignacion.subject_id) throw new ApiError(404, 'Clase no encontrada.');
  return asignacion;
}

async function exigirPreescolar(asignacion: TeacherAssignmentDocument): Promise<void> {
  if (!asignacion.group_id || !(await esGrupoSinReprobacion(asignacion.group_id))) {
    throw new ApiError(409, 'Esta clase no es de Preescolar: se califica con la planilla de notas numérica.');
  }
}

async function estudiantesDelGrupo(asignacion: TeacherAssignmentDocument): Promise<Estudiante[]> {
  const matriculas = await Enrollment.find({ group_id: asignacion.group_id, academic_year_id: asignacion.academic_year_id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } })
    .populate<{ student_id: Estudiante }>('student_id', 'nombre apellido numero_documento')
    .lean();
  return matriculas.map((m) => m.student_id).filter(Boolean).sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es'));
}

function exigirPeriodo(anio: { periodos: Array<{ numero: number }>; year: number }, periodo: number): void {
  if (!anio.periodos.some((p) => p.numero === periodo)) throw new ApiError(400, `El año ${anio.year} no tiene periodo ${periodo}.`);
}

/** Los estudiantes del grupo con la valoración que ya tienen en el periodo (o ninguna). Solo Preescolar. */
export async function planillaDescriptiva(asignacionId: string, periodo: number, usuario: UserDocument): Promise<PlanillaDescriptiva> {
  const asignacion = await cargarAsignacion(asignacionId, usuario);
  await exigirPreescolar(asignacion);
  const anio = await AcademicYear.findById(asignacion.academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  exigirPeriodo(anio, periodo);

  const [estudiantes, valoraciones, grupo, asignatura] = await Promise.all([
    estudiantesDelGrupo(asignacion),
    ValoracionDescriptiva.find({ teacher_assignment_id: asignacion._id, periodo_numero: periodo }).lean(),
    Group.findById(asignacion.group_id).select('nomenclatura'),
    Subject.findById(asignacion.subject_id).select('nombre'),
  ]);
  const porEstudiante = new Map(valoraciones.map((v) => [String(v.student_id), v]));

  let motivo: string | null = null;
  if (usuario.rol !== ROLES.DOCENTE) motivo = 'Solo el docente de la clase registra las valoraciones.';
  else {
    try {
      await assertPeriodNotLocked(anio._id, asignacion.group_id as Types.ObjectId, periodo, usuario._id);
    } catch (err) {
      motivo = err instanceof Error ? err.message : 'El periodo no admite registros.';
    }
  }

  return {
    asignatura: asignatura?.nombre ?? '',
    grupo: grupo?.nomenclatura ?? '',
    periodo_numero: periodo,
    editable: motivo === null,
    motivo_no_editable: motivo,
    filas: estudiantes.map((e) => {
      const v = porEstudiante.get(String(e._id));
      return {
        student_id: String(e._id),
        nombre: e.nombre,
        apellido: e.apellido,
        numero_documento: e.numero_documento,
        valoracion: v ? { nivel: v.nivel, fortalezas: v.fortalezas, recomendaciones: v.recomendaciones } : null,
      };
    }),
  };
}

/**
 * Guarda las valoraciones de un periodo (todo o nada: si una no es válida no se guarda ninguna). Solo el docente de la clase, mientras el periodo
 * admita registros (el mismo punto que decide las notas numéricas, `assertPeriodNotLocked`), y solo de estudiantes con matrícula activa en el grupo.
 */
export async function guardarValoraciones(asignacionId: string, periodo: number, items: ValoracionEntrada[], usuario: UserDocument, ip?: string | null): Promise<{ guardadas: number }> {
  if (usuario.rol !== ROLES.DOCENTE) throw new ApiError(403, 'Solo el docente de la clase registra las valoraciones.');
  const asignacion = await asignacionDelDocente(asignacionId, usuario);
  await exigirPreescolar(asignacion);
  const anio = await AcademicYear.findById(asignacion.academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  exigirPeriodo(anio, periodo);
  await assertPeriodNotLocked(anio._id, asignacion.group_id as Types.ObjectId, periodo, usuario._id);

  if (items.length === 0) throw new ApiError(400, 'No hay valoraciones que guardar.');
  if (items.length > MAX_ESTUDIANTES_POR_GUARDADO) throw new ApiError(400, `Se guardan hasta ${MAX_ESTUDIANTES_POR_GUARDADO} valoraciones a la vez.`);
  const del = new Set((await estudiantesDelGrupo(asignacion)).map((e) => String(e._id)));
  const errores: string[] = [];
  const vistos = new Set<string>();
  for (const [i, v] of items.entries()) {
    const fila = `Fila ${i + 1}`;
    if (!del.has(v.student_id)) errores.push(`${fila}: el estudiante no tiene matrícula activa en este grupo.`);
    if (vistos.has(v.student_id)) errores.push(`${fila}: el estudiante está repetido.`);
    vistos.add(v.student_id);
    if (!(NIVELES_VALORACION as readonly string[]).includes(v.nivel)) errores.push(`${fila}: el nivel no es válido.`);
    for (const [campo, texto] of [['las fortalezas', v.fortalezas], ['las recomendaciones', v.recomendaciones]] as const) {
      const largo = texto.trim().length;
      if (largo < MIN_CARACTERES_DESCRIPTOR) errores.push(`${fila}: escribe ${campo} (mínimo ${MIN_CARACTERES_DESCRIPTOR} caracteres).`);
      if (largo > MAX_CARACTERES_DESCRIPTOR) errores.push(`${fila}: ${campo} superan ${MAX_CARACTERES_DESCRIPTOR} caracteres.`);
    }
  }
  if (errores.length > 0) throw new ApiError(400, 'Hay valoraciones que corregir; no se guardó ninguna.', errores);

  await ValoracionDescriptiva.bulkWrite(
    items.map((v) => ({
      updateOne: {
        filter: { teacher_assignment_id: asignacion._id, student_id: v.student_id, periodo_numero: periodo },
        update: { $set: { academic_year_id: asignacion.academic_year_id, nivel: v.nivel, fortalezas: v.fortalezas.trim(), recomendaciones: v.recomendaciones.trim(), registrado_por: usuario._id } },
        upsert: true,
      },
    }))
  );
  // El detalle no lleva nombres ni textos: solo cuántas.
  await registrarEvento({ usuario_id: usuario._id, accion: 'VALORACION_DESCRIPTIVA_GUARDADA', entidad: 'TeacherAssignment', entidad_id: asignacion._id, detalle: `Periodo ${periodo}: ${items.length} valoraciones`, ip });
  return { guardadas: items.length };
}

export { ESTADO_ACTIVO };
