import { Types } from 'mongoose';
import CurricularDevelopment from '../models/curricularDevelopment.model';
import Group from '../models/group.model';
import Institution, { ILimitesCargaDocente } from '../models/institution.model';
import StudyPlan from '../models/studyPlan.model';
import Subject from '../models/subject.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import User from '../models/user.model';
import { NivelEducativo, TipoAsignacionDocente } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { registrarEvento } from './audit.service';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { runTransaction } from '../utils/runTransaction';

export interface ActorAsignacion {
  id: string | Types.ObjectId;
  ip?: string | null;
}

export interface CreateTeacherAssignmentInput {
  docente_id: string;
  academic_year_id: string;
  tipo_asignacion?: TipoAsignacionDocente;
  group_id?: string | null;
  subject_id?: string | null;
  horas_semanales: number;
  proyecto_nombre?: string;
  observaciones?: string;
}

export interface ListAssignmentsQuery {
  academic_year_id?: string;
  docente_id?: string;
  group_id?: string;
  tipo_asignacion?: string;
  estado?: string;
}

export async function createTeacherAssignment(
  input: CreateTeacherAssignmentInput,
  actor: ActorAsignacion
): Promise<TeacherAssignmentDocument> {
  const tipo = input.tipo_asignacion || 'CLASE';

  // 1. Validar que el usuario sea un DOCENTE activo
  const docente = await User.findOne({ _id: input.docente_id, rol: ROLES.DOCENTE });
  if (!docente) {
    throw new ApiError(404, 'El usuario no existe o no tiene rol DOCENTE.');
  }
  if (docente.estado === 'inactivo') {
    throw new ApiError(409, 'El docente se encuentra inactivo.');
  }

  // 2. Validar año lectivo: un año CERRADO es historico de solo lectura, igual que en M01/M04/M05/M10.
  await asegurarAnioNoCerrado(input.academic_year_id);

  // DIRECCION_GRUPO escribe dos documentos relacionados (desactiva la asignacion anterior y
  // mueve Group.director_grupo_id): en transaccion, igual que las demas escrituras de 2+
  // documentos del sistema (ver enrollment.service/admissionRequest.service), para que una
  // falla a mitad de camino no deje al grupo sin director o con dos asignaciones activas.
  const assignment = await runTransaction(async (session) => {
    let detalleAuditoria = '';

    // 3. Validaciones según el tipo de asignación
    if (tipo === 'CLASE') {
      if (!input.group_id) {
        throw new ApiError(400, 'Se requiere el grupo para una asignación de clase.');
      }
      if (!input.subject_id) {
        throw new ApiError(400, 'Se requiere la asignatura para una asignación de clase.');
      }

      const group = await Group.findById(input.group_id).session(session);
      if (!group) throw new ApiError(404, 'Grupo no encontrado.');
      if (String(group.academic_year_id) !== String(input.academic_year_id)) {
        throw new ApiError(400, 'El grupo no pertenece al año lectivo indicado.');
      }

      const subject = await Subject.findById(input.subject_id).session(session);
      if (!subject) throw new ApiError(404, 'Asignatura no encontrada.');
      if (subject.estado !== 'activo') {
        throw new ApiError(400, `La asignatura "${subject.nombre}" está inactiva en el Catálogo Académico.`);
      }

      let horasAsignadas = input.horas_semanales;

      // Validar concordancia con el Plan de Estudios de M06 si existe
      const studyPlan = await StudyPlan.findOne({ academic_year_id: input.academic_year_id }).session(session);
      if (studyPlan) {
        const gradoConfig = studyPlan.grades.find((g) => String(g.grade_id) === String(group.grade_id));

        if (gradoConfig) {
          // Verificar si la asignatura está en la configuración general del grado o personalizada para el grupo
          const asgGrado = gradoConfig.asignaturas.find((a) => String(a.subject_id) === String(input.subject_id));
          const personalizacionGrupo = gradoConfig.personalizaciones_grupo.find(
            (p) => String(p.group_id) === String(group._id)
          );
          const asgAgregada = personalizacionGrupo?.asignaturas_agregadas.find(
            (a) => String(a.subject_id) === String(input.subject_id)
          );
          const overrideHoras = personalizacionGrupo?.intensidades_personalizadas.find(
            (a) => String(a.subject_id) === String(input.subject_id)
          );

          if (!asgGrado && !asgAgregada) {
            throw new ApiError(
              400,
              `La asignatura "${subject.nombre}" no hace parte del plan de estudios aprobado para este grado/grupo.`
            );
          }

          // Fijar exactamente la intensidad horaria semanal configurada en M06
          if (overrideHoras) {
            horasAsignadas = overrideHoras.intensidad_horaria_semanal;
          } else if (asgAgregada) {
            horasAsignadas = asgAgregada.intensidad_horaria_semanal;
          } else if (asgGrado) {
            horasAsignadas = asgGrado.intensidad_horaria_semanal;
          }
        }
      }

      input.horas_semanales = horasAsignadas;

      // Verificar si ya existe otro docente asignado a esta materia en este grupo
      const existing = await TeacherAssignment.findOne({
        academic_year_id: input.academic_year_id,
        group_id: input.group_id,
        subject_id: input.subject_id,
        tipo_asignacion: 'CLASE',
        estado: ESTADO_ACTIVO,
      }).session(session);

      if (existing) {
        if (String(existing.docente_id) === String(input.docente_id)) {
          throw new ApiError(409, 'El docente ya tiene asignada esta materia en este grupo.');
        }
        throw new ApiError(409, 'Esta asignatura ya está asignada a otro docente en este grupo.');
      }

      detalleAuditoria = `Clase: ${subject.nombre} en grupo ${group.nomenclatura} (${input.horas_semanales}h/sem)`;
    } else if (tipo === 'DIRECCION_GRUPO') {
      if (!input.group_id) {
        throw new ApiError(400, 'Se requiere especificar el grupo para la dirección de grupo.');
      }
      const group = await Group.findById(input.group_id).session(session);
      if (!group) throw new ApiError(404, 'Grupo no encontrado.');
      if (String(group.academic_year_id) !== String(input.academic_year_id)) {
        throw new ApiError(400, 'El grupo no pertenece al año lectivo indicado.');
      }

      if (group.director_grupo_id && String(group.director_grupo_id) === String(docente._id)) {
        throw new ApiError(409, 'Este docente ya es el director de este grupo.');
      }

      // Dirección de grupo no computa horas lectivas
      input.horas_semanales = 0;

      // Reemplazar al director anterior (si lo hay): su asignacion queda inactiva, no se borra
      // (preserva el historial, igual que CLASE conserva una asignacion revocada via estado).
      const directorAnterior = group.director_grupo_id
        ? await TeacherAssignment.findOneAndUpdate(
            { group_id: group._id, tipo_asignacion: 'DIRECCION_GRUPO', estado: ESTADO_ACTIVO },
            { $set: { estado: 'inactivo' } },
            { session }
          )
        : null;

      // Asignar en el modelo del grupo
      group.director_grupo_id = docente._id;
      await group.save({ session });

      detalleAuditoria = `Dirección de grupo ${group.nomenclatura}${
        directorAnterior ? ` (reemplaza a docente ${directorAnterior.docente_id})` : ''
      }`;
    } else if (tipo === 'PROYECTO_TRANSVERSAL' || tipo === 'OTRO') {
      if (!input.proyecto_nombre || input.proyecto_nombre.trim() === '') {
        throw new ApiError(400, 'Se requiere el nombre del proyecto pedagógico o comisión asignada.');
      }
      detalleAuditoria = `${tipo === 'PROYECTO_TRANSVERSAL' ? 'Proyecto transversal' : 'Otra asignación'}: ${input.proyecto_nombre}`;
    }

    const [creada] = await TeacherAssignment.create(
      [{ ...input, tipo_asignacion: tipo, estado: 'activo' }],
      { session }
    );
    if (!creada) throw new ApiError(500, 'No se pudo crear la asignación académica.');

    return { creada, detalleAuditoria };
  });

  await registrarEvento({
    usuario_id: actor.id,
    accion: 'ASIGNACION_DOCENTE_CREADA',
    entidad: 'TeacherAssignment',
    entidad_id: assignment.creada._id,
    detalle: `Docente ${docente._id} — ${assignment.detalleAuditoria}`,
    ip: actor.ip,
  });

  return assignment.creada;
}

export async function listTeacherAssignments(query: ListAssignmentsQuery) {
  const filter: Record<string, unknown> = {};

  if (query.academic_year_id) filter.academic_year_id = query.academic_year_id;
  if (query.docente_id) filter.docente_id = query.docente_id;
  if (query.group_id) filter.group_id = query.group_id;
  if (query.tipo_asignacion) filter.tipo_asignacion = query.tipo_asignacion;
  if (query.estado) filter.estado = query.estado;
  else filter.estado = ESTADO_ACTIVO;

  return TeacherAssignment.find(filter)
    .populate('docente_id', 'nombre apellido numero_documento email estado')
    .populate({
      path: 'group_id',
      select: 'nomenclatura sede_id jornada_id grade_id max_capacity',
      populate: [
        { path: 'sede_id', select: 'nombre' },
        { path: 'grade_id', select: 'nombre numero nivel' },
        { path: 'jornada_id', select: 'nombre' },
      ],
    })
    .populate({
      path: 'subject_id',
      select: 'nombre abreviatura area_id tipo',
      populate: { path: 'area_id', select: 'nombre codigo' },
    })
    .populate('academic_year_id', 'year calendario estado')
    .sort({ createdAt: -1 });
}

export async function getDocentesCargaResumen(academicYearId: string) {
  // 0. Obtener topes institucionales configurados (Decreto 1850)
  const institucion = await Institution.findOne().select('limites_carga_docente');
  const limites = institucion?.limites_carga_docente || {
    PREESCOLAR: 20,
    PRIMARIA: 25,
    SECUNDARIA: 22,
    MEDIA: 22,
  };

  // 1. Obtener todos los docentes activos
  const docentes = await User.find({ rol: ROLES.DOCENTE, estado: ESTADO_ACTIVO })
    .select('nombre apellido numero_documento email')
    .sort({ apellido: 1, nombre: 1 });

  // 2. Obtener todas las asignaciones del año lectivo
  const assignments = await TeacherAssignment.find({
    academic_year_id: academicYearId,
    estado: ESTADO_ACTIVO,
  })
    .populate({
      path: 'group_id',
      select: 'nomenclatura grade_id',
      populate: { path: 'grade_id', select: 'nombre numero nivel' },
    })
    .populate('subject_id', 'nombre abreviatura');

  // 3. Agrupar carga por docente
  const assignmentsByDocente = new Map<string, TeacherAssignmentDocument[]>();
  for (const asg of assignments) {
    const docId = String(asg.docente_id);
    const list = assignmentsByDocente.get(docId) ?? [];
    list.push(asg);
    assignmentsByDocente.set(docId, list);
  }

  return docentes.map((doc) => {
    const docId = String(doc._id);
    const docAssignments = assignmentsByDocente.get(docId) ?? [];

    let horasClase = 0;
    let horasDireccion = 0;
    let horasProyectos = 0;

    const nivelesCount: Record<string, number> = {};

    for (const a of docAssignments) {
      if (a.tipo_asignacion === 'CLASE') {
        horasClase += a.horas_semanales;
        if (a.group_id) {
          const grp = a.group_id as unknown as { grade_id?: { nivel?: NivelEducativo } };
          const nivel = grp.grade_id?.nivel;
          if (nivel) {
            nivelesCount[nivel] = (nivelesCount[nivel] ?? 0) + 1;
          }
        }
      } else if (a.tipo_asignacion === 'DIRECCION_GRUPO') {
        horasDireccion += a.horas_semanales;
      } else {
        horasProyectos += a.horas_semanales;
      }
    }

    const horasTotales = horasClase + horasDireccion + horasProyectos;

    // Determinar nivel predominante del docente
    let nivelPredominante: NivelEducativo = 'SECUNDARIA';
    let maxOcurrencias = 0;
    for (const [lvl, count] of Object.entries(nivelesCount)) {
      if (count > maxOcurrencias) {
        maxOcurrencias = count;
        nivelPredominante = lvl as NivelEducativo;
      }
    }

    // Tope de horas según nivel educativo
    const topeHoras = (limites as ILimitesCargaDocente)[nivelPredominante as keyof ILimitesCargaDocente] ?? 22;

    // Diagnóstico según normativa colombiana (Decreto 1850 de 2002) y configuración institucional
    let estadoCarga: 'SUB_CARGA' | 'NORMAL' | 'SOBRE_CARGA' = 'NORMAL';
    if (horasTotales === 0) estadoCarga = 'SUB_CARGA';
    else if (horasTotales > topeHoras) estadoCarga = 'SOBRE_CARGA';
    else if (horasTotales < topeHoras - 2) estadoCarga = 'SUB_CARGA';

    return {
      docente: {
        _id: doc._id,
        nombre: doc.nombre,
        apellido: doc.apellido,
        numero_documento: doc.numero_documento,
        email: doc.email,
      },
      horas_clase: horasClase,
      horas_direccion: horasDireccion,
      horas_proyectos: horasProyectos,
      horas_totales: horasTotales,
      estado_carga: estadoCarga,
      nivel_predominante: nivelPredominante,
      tope_horas: topeHoras,
      total_asignaciones: docAssignments.length,
      asignaciones: docAssignments,
    };
  });
}

export async function deleteTeacherAssignment(id: string, actor: ActorAsignacion): Promise<void> {
  const assignment = await TeacherAssignment.findById(id);
  if (!assignment) {
    throw new ApiError(404, 'Asignación docente no encontrada.');
  }

  // Un año CERRADO es historico de solo lectura, igual que en M01/M04/M05/M10.
  await asegurarAnioNoCerrado(String(assignment.academic_year_id));

  await runTransaction(async (session) => {
    // Verificar si tiene desarrollo curricular asociado
    const dev = await CurricularDevelopment.findOne({ teacher_assignment_id: id }).session(session);
    if (dev && dev.estado === 'APROBADO') {
      throw new ApiError(
        409,
        'No se puede eliminar la asignación académica porque ya cuenta con una planeación curricular aprobada.'
      );
    }

    // Si era dirección de grupo y sigue siendo el director vigente del grupo, limpiar el campo
    // (si ya fue reemplazado por otro docente, esta asignacion esta inactiva y no debe tocar al
    // director actual — ver createTeacherAssignment).
    if (assignment.tipo_asignacion === 'DIRECCION_GRUPO' && assignment.group_id) {
      await Group.updateOne(
        { _id: assignment.group_id, director_grupo_id: assignment.docente_id },
        { $unset: { director_grupo_id: 1 } },
        { session }
      );
    }

    // Si tenía borrador de desarrollo curricular no aprobado, eliminarlo
    if (dev) {
      await CurricularDevelopment.findByIdAndDelete(dev._id).session(session);
    }

    await TeacherAssignment.findByIdAndDelete(id).session(session);
  });

  await registrarEvento({
    usuario_id: actor.id,
    accion: 'ASIGNACION_DOCENTE_ELIMINADA',
    entidad: 'TeacherAssignment',
    entidad_id: id,
    detalle: `Docente ${assignment.docente_id} — tipo ${assignment.tipo_asignacion}`,
    ip: actor.ip,
  });
}
