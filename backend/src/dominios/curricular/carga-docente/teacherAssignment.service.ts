import { Types } from 'mongoose';
import Activity from '../../academico/actividades-notas/activity.model';
import Counter from '../../../models/counter.model';
import AcademicYear from '../../institucional/calendario/academicYear.model';
import CurricularDevelopment from '../desarrollo/curricularDevelopment.model';
import Group from '../../institucional/estructura/group.model';
import StudyPlan from '../plan-estudios/studyPlan.model';
import Subject from '../plan-estudios/subject.model';
import TeacherAssignment, { TeacherAssignmentDocument } from './teacherAssignment.model';
import User from '../../../models/user.model';
import { NivelEducativo, TipoAsignacionDocente } from '../../../constants/enums';
import { ROLES } from '../../../constants/roles';
import { asegurarAnioNoCerrado } from '../../institucional';
import { registrarEvento } from '../../../services/audit.service';
import { getLimitesCarga } from '../../institucional';
import ApiError from '../../../utils/ApiError';
import { resumirCargaDocente } from './cargaDocente';
import { ESTADO_ACTIVO, filtroPorEstado } from '../../../utils/filtroEstado';
import { runTransaction } from '../../../utils/runTransaction';

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
  /** Solo DIRECCION_GRUPO: confirma que se quita al director actual del grupo, si lo tiene. */
  reemplazar_director?: boolean;
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
    let asignacionesReemplazadas: TeacherAssignmentDocument[] = [];

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
      if (group.estado !== 'ACTIVE') {
        throw new ApiError(400, `El grupo ${group.nomenclatura} está cerrado: no admite nuevas asignaciones.`);
      }

      const subject = await Subject.findById(input.subject_id).session(session);
      if (!subject) throw new ApiError(404, 'Asignatura no encontrada.');
      if (subject.estado !== 'activo') {
        throw new ApiError(400, `La asignatura "${subject.nombre}" está inactiva en el Catálogo Académico.`);
      }

      // Regla de oro de datos: la intensidad horaria de una CLASE sale siempre del Plan de
      // Estudios (M06) por llave foranea, nunca de lo que mande el cliente. Un año sin plan, o
      // un grado/asignatura que el plan todavia no cubre, bloquea la asignacion en vez de aceptar
      // horas arbitrarias — el frontend ya exige lo mismo (solo ofrece asignaturas del plan).
      const studyPlan = await StudyPlan.findOne({ academic_year_id: input.academic_year_id }).session(session);
      if (!studyPlan) {
        throw new ApiError(
          400,
          'Este año lectivo todavía no tiene un Plan de Estudios configurado (M06). Configúralo antes de asignar clases.'
        );
      }
      const gradoConfig = studyPlan.grades.find((g) => String(g.grade_id) === String(group.grade_id));
      if (!gradoConfig) {
        throw new ApiError(
          400,
          'El grado de este grupo todavía no tiene Configuración General en el Plan de Estudios (M06).'
        );
      }

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
        input.horas_semanales = overrideHoras.intensidad_horaria_semanal;
      } else if (asgAgregada) {
        input.horas_semanales = asgAgregada.intensidad_horaria_semanal;
      } else if (asgGrado) {
        input.horas_semanales = asgGrado.intensidad_horaria_semanal;
      }

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
      if (group.estado !== 'ACTIVE') {
        throw new ApiError(400, `El grupo ${group.nomenclatura} está cerrado: no admite nuevas asignaciones.`);
      }

      if (group.director_grupo_id && String(group.director_grupo_id) === String(docente._id)) {
        throw new ApiError(409, 'Este docente ya es el director de este grupo.');
      }

      // Cuántos grupos puede dirigir un mismo docente es política de la institución (por defecto 1):
      // un docente con grupos en mañana y tarde puede necesitar más de uno. El grupo que se está
      // reasignando no cuenta, porque su titularidad actual la deja de tener este mismo docente.
      // Las transacciones solo chocan si escriben el MISMO documento: dos direcciones simultáneas del mismo
      // docente en grupos distintos no lo harían y ambas pasarían el límite. Este contador común fuerza el
      // conflicto; runTransaction reintenta la perdedora, que ya ve a la primera y recibe el 409.
      await Counter.findByIdAndUpdate(
        `DIR-${input.academic_year_id}-${docente._id}`,
        { $inc: { seq: 1 } },
        { upsert: true, session }
      );
      const { max_direcciones_grupo_por_docente: maxDirecciones } = await getLimitesCarga();
      const gruposQueYaDirige = await TeacherAssignment.find({
        academic_year_id: input.academic_year_id,
        docente_id: docente._id,
        tipo_asignacion: 'DIRECCION_GRUPO',
        estado: ESTADO_ACTIVO,
        group_id: { $ne: group._id },
      })
        .populate('group_id', 'nomenclatura')
        .session(session);
      if (gruposQueYaDirige.length >= maxDirecciones) {
        const nombres = gruposQueYaDirige
          .map((a) => (a.group_id as unknown as { nomenclatura?: string } | null)?.nomenclatura)
          .filter(Boolean)
          .join(', ');
        throw new ApiError(
          409,
          `El docente ya dirige ${gruposQueYaDirige.length} grupo(s)${nombres ? ` (${nombres})` : ''} en este año lectivo ` +
            `y la institución permite un máximo de ${maxDirecciones} por docente.`
        );
      }

      // Reemplazar al director anterior (si lo hay): su(s) asignacion(es) quedan inactivas, no se
      // borran (preserva el historial). Se buscan TODAS las activas (no solo una) para que, aunque
      // hubiera mas de una por una inconsistencia de datos previa, ninguna sobreviva junto a la
      // nueva — el indice unico parcial del modelo ya evita que eso vuelva a ocurrir de aqui en más.
      const asignacionesAnteriores = await TeacherAssignment.find({
        group_id: group._id,
        tipo_asignacion: 'DIRECCION_GRUPO',
        estado: ESTADO_ACTIVO,
      }).session(session);
      if (asignacionesAnteriores.length > 0 && !input.reemplazar_director) {
        const actual = await User.findById(asignacionesAnteriores[0]?.docente_id).select('nombre apellido');
        throw new ApiError(
          409,
          `El grupo ${group.nomenclatura} ya tiene director${actual ? ` (${actual.apellido}, ${actual.nombre})` : ''}. ` +
            'Confirma el reemplazo para quitarle la dirección y asignarla a este docente.'
        );
      }
      if (asignacionesAnteriores.length > 0) {
        await TeacherAssignment.updateMany(
          { _id: { $in: asignacionesAnteriores.map((a) => a._id) } },
          { $set: { estado: 'inactivo' } },
          { session }
        );
      }
      asignacionesReemplazadas = asignacionesAnteriores;

      // Asignar en el modelo del grupo
      group.director_grupo_id = docente._id;
      await group.save({ session });

      detalleAuditoria = `Dirección de grupo ${group.nomenclatura}${
        asignacionesAnteriores[0] ? ` (reemplaza a docente ${asignacionesAnteriores[0].docente_id})` : ''
      }`;
    } else if (tipo === 'PROYECTO_TRANSVERSAL' || tipo === 'OTRO') {
      if (!input.proyecto_nombre || input.proyecto_nombre.trim() === '') {
        throw new ApiError(400, 'Se requiere el nombre del proyecto pedagógico o comisión asignada.');
      }
      detalleAuditoria = `${tipo === 'PROYECTO_TRANSVERSAL' ? 'Proyecto transversal' : 'Otra asignación'}: ${input.proyecto_nombre}`;
    }

    const { reemplazar_director: _confirmacion, ...datosAsignacion } = input;
    const [creada] = await TeacherAssignment.create(
      [{ ...datosAsignacion, tipo_asignacion: tipo, estado: 'activo' }],
      { session }
    );
    if (!creada) throw new ApiError(500, 'No se pudo crear la asignación académica.');

    return { creada, detalleAuditoria, asignacionesReemplazadas };
  });

  await registrarEvento({
    usuario_id: actor.id,
    accion: 'ASIGNACION_DOCENTE_CREADA',
    entidad: 'TeacherAssignment',
    entidad_id: assignment.creada._id,
    detalle: `Docente ${docente._id} — ${assignment.detalleAuditoria}`,
    ip: actor.ip,
  });

  // Efecto secundario auditado por separado (entidad_id propio), no solo mencionado en el detalle
  // del evento de creación: quien reemplazó a quién como director debe poder rastrearse por sí solo.
  for (const anterior of assignment.asignacionesReemplazadas) {
    await registrarEvento({
      usuario_id: actor.id,
      accion: 'ASIGNACION_DOCENTE_REEMPLAZADA',
      entidad: 'TeacherAssignment',
      entidad_id: anterior._id,
      detalle: `Docente ${anterior.docente_id} reemplazado como director por ${docente._id} — ${assignment.detalleAuditoria}`,
      ip: actor.ip,
    });
  }

  return assignment.creada;
}

export async function listTeacherAssignments(query: ListAssignmentsQuery) {
  const filter: Record<string, unknown> = {};

  if (query.academic_year_id) filter.academic_year_id = query.academic_year_id;
  if (query.docente_id) filter.docente_id = query.docente_id;
  if (query.group_id) filter.group_id = query.group_id;
  if (query.tipo_asignacion) filter.tipo_asignacion = query.tipo_asignacion;
  filter.estado = filtroPorEstado(query.estado || 'activo');

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
  const academicYear = await AcademicYear.findById(academicYearId).select('_id');
  if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');

  // 0. Obtener topes institucionales configurados (Decreto 1850) — misma fuente que M08 usa
  // para editarlos (institution.service.ts), sin duplicar aquí los valores de respaldo.
  const limites = await getLimitesCarga();

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

    const resumen = resumirCargaDocente(
      docAssignments.map((a) => {
        const grupo = a.group_id as unknown as { grade_id?: { nivel?: NivelEducativo } } | null;
        return { tipo_asignacion: a.tipo_asignacion, horas_semanales: a.horas_semanales, nivel: grupo?.grade_id?.nivel };
      }),
      limites,
      limites.tolerancia_subcarga_horas
    );

    return {
      docente: {
        _id: doc._id,
        nombre: doc.nombre,
        apellido: doc.apellido,
        numero_documento: doc.numero_documento,
        email: doc.email,
      },
      ...resumen,
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

  // Una CLASE con actividades/notas registradas (M12) no se elimina: borrarla haria desaparecer
  // esas notas del boletin, y es ademas la unica forma de "cambiar de docente" que tiene la UI,
  // lo que destruiria el historial de una materia a mitad de año. Se preserva (ver tambien el
  // bloqueo por planeacion APROBADA mas abajo), igual que subject.service.ts bloquea inactivar
  // una asignatura con asignaciones activas.
  const tieneActividades = await Activity.exists({ teacher_assignment_id: id });
  if (tieneActividades) {
    throw new ApiError(
      409,
      'No se puede eliminar la asignación académica: ya tiene actividades o notas registradas (M12).'
    );
  }

  await runTransaction(async (session) => {
    // Una asignacion puede tener hasta una planeacion por periodo (1-4): revisar todas, no solo
    // la primera que encuentre, o una ya APROBADA en otro periodo se borraria sin bloquear nada.
    const devs = await CurricularDevelopment.find({ teacher_assignment_id: id }).session(session);
    if (devs.some((dev) => dev.estado === 'APROBADO')) {
      throw new ApiError(
        409,
        'No se puede eliminar la asignación académica porque ya cuenta con una planeación curricular aprobada.'
      );
    }

    // Si era dirección de grupo y sigue siendo el director vigente del grupo, limpiar el campo
    // (si ya fue reemplazado por otro docente, esta asignacion esta inactiva y no debe tocar al
    // director actual — ver createTeacherAssignment). Nunca se "conserva via estado" como
    // DIRECCION_GRUPO: una CLASE siempre se borra fisicamente si llega hasta aqui (sin
    // actividades ni planeacion aprobada, no hay nada que preservar).
    if (assignment.tipo_asignacion === 'DIRECCION_GRUPO' && assignment.group_id) {
      await Group.updateOne(
        { _id: assignment.group_id, director_grupo_id: assignment.docente_id },
        { $unset: { director_grupo_id: 1 } },
        { session }
      );
    }

    // Ninguna quedó APROBADA (ya se validó arriba): se pueden borrar todos los borradores/envíos.
    if (devs.length > 0) {
      await CurricularDevelopment.deleteMany({ teacher_assignment_id: id }).session(session);
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

/**
 * Carga académica del docente autenticado. Si se indica academic_year_id, se acota a ese año
 * (así "mi carga" no mezcla años ya cerrados); sin año, se listan solo las activas de años que
 * no esten CERRADOS, para no sumar horas de historia en los contadores de la página del docente.
 */
export async function getMyLoad(docenteId: string | Types.ObjectId, academicYearId?: string) {
  const filter: Record<string, unknown> = { docente_id: docenteId, estado: ESTADO_ACTIVO };

  if (academicYearId) {
    filter.academic_year_id = academicYearId;
  } else {
    const aniosNoCerrados = await AcademicYear.find({ estado: { $ne: 'CERRADO' } }).select('_id');
    filter.academic_year_id = { $in: aniosNoCerrados.map((a) => a._id) };
  }

  return TeacherAssignment.find(filter)
    .populate({
      path: 'group_id',
      select: 'nomenclatura jornada_id max_capacity grade_id sede_id',
      populate: [
        { path: 'grade_id', select: 'nombre numero' },
        { path: 'sede_id', select: 'nombre' },
        { path: 'jornada_id', select: 'nombre' },
      ],
    })
    .populate({
      path: 'subject_id',
      select: 'nombre abreviatura area_id',
      populate: { path: 'area_id', select: 'nombre codigo' },
    })
    .populate('academic_year_id', 'year calendario estado')
    .sort({ createdAt: -1 });
}
