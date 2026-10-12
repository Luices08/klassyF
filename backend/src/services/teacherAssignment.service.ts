import { Types } from 'mongoose';
import Activity from '../models/activity.model';
import Counter from '../models/counter.model';
import AcademicYear from '../models/academicYear.model';
import CurricularDevelopment from '../models/curricularDevelopment.model';
import Group from '../models/group.model';
import StudyPlan from '../models/studyPlan.model';
import Subject from '../models/subject.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import User from '../models/user.model';
import { NivelEducativo, TipoAsignacionDocente } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { registrarEvento } from './audit.service';
import { getLimitesCarga } from './institution.service';
import ApiError from '../utils/ApiError';
import { resumirCargaDocente } from '../utils/cargaDocente';
import { ESTADO_ACTIVO, filtroPorEstado } from '../utils/filtroEstado';
import { horasDeAsignaturaEnGrupo } from '../utils/horasPlanEstudios';
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
      const personalizacionJornada = gradoConfig.jornadas_personalizadas?.find(
        (j) => String(j.jornada_id) === String(group.jornada_id)
      );

      const asgAgregada = personalizacionGrupo?.asignaturas_agregadas.find(
        (a) => String(a.subject_id) === String(input.subject_id)
      );
      const overrideHoras = personalizacionGrupo?.intensidades_personalizadas.find(
        (a) => String(a.subject_id) === String(input.subject_id)
      );

      const asgJornadaAgregada = personalizacionJornada?.asignaturas_agregadas.find(
        (a) => String(a.subject_id) === String(input.subject_id)
      );
      const overrideHorasJornada = personalizacionJornada?.intensidades_personalizadas.find(
        (a) => String(a.subject_id) === String(input.subject_id)
      );

      if (!asgGrado && !asgAgregada && !asgJornadaAgregada) {
        throw new ApiError(
          400,
          `La asignatura "${subject.nombre}" no hace parte del plan de estudios aprobado para este grado/grupo.`
        );
      }

      // Fijar exactamente la intensidad horaria semanal configurada en M06 (prioridad: grupo > jornada > grado base)
      if (overrideHoras) {
        input.horas_semanales = overrideHoras.intensidad_horaria_semanal;
      } else if (asgAgregada) {
        input.horas_semanales = asgAgregada.intensidad_horaria_semanal;
      } else if (overrideHorasJornada) {
        input.horas_semanales = overrideHorasJornada.intensidad_horaria_semanal;
      } else if (asgJornadaAgregada) {
        input.horas_semanales = asgJornadaAgregada.intensidad_horaria_semanal;
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

export interface ClaseLoteInput {
  group_id: string;
  subject_id: string;
  observaciones?: string;
}

export interface ProyectoLoteInput {
  proyecto_nombre: string;
  horas_semanales: number;
  observaciones?: string;
}

export interface GuardarCargaDocenteLoteInput {
  docente_id: string;
  academic_year_id: string;
  direccion_grupo_id?: string | null;
  horas_direccion?: number;
  clases: ClaseLoteInput[];
  proyectos?: ProyectoLoteInput[];
}

export async function guardarCargaDocenteLote(
  input: GuardarCargaDocenteLoteInput,
  actor: ActorAsignacion
) {
  const docente = await User.findOne({ _id: input.docente_id, rol: ROLES.DOCENTE });
  if (!docente) throw new ApiError(404, 'El usuario no existe o no tiene rol DOCENTE.');
  if (docente.estado === 'inactivo') throw new ApiError(409, 'El docente se encuentra inactivo.');

  await asegurarAnioNoCerrado(input.academic_year_id);

  const studyPlan = await StudyPlan.findOne({ academic_year_id: input.academic_year_id });
  if (!studyPlan) {
    throw new ApiError(
      400,
      'Este año lectivo todavía no tiene un Plan de Estudios configurado (M06). Configúralo antes de asignar clases.'
    );
  }

  return runTransaction(async (session) => {
    const asignacionesActuales = await TeacherAssignment.find({
      docente_id: docente._id,
      academic_year_id: input.academic_year_id,
      estado: ESTADO_ACTIVO,
    }).session(session);

    const clasesActuales = asignacionesActuales.filter((a) => a.tipo_asignacion === 'CLASE');
    const direccionesActuales = asignacionesActuales.filter((a) => a.tipo_asignacion === 'DIRECCION_GRUPO');
    const proyectosActuales = asignacionesActuales.filter(
      (a) => a.tipo_asignacion === 'PROYECTO_TRANSVERSAL' || a.tipo_asignacion === 'OTRO'
    );

    // Dirección de grupo
    const targetDirGroupId = input.direccion_grupo_id ? String(input.direccion_grupo_id) : null;
    const currentDir = direccionesActuales[0] || null;
    const currentDirGroupId = currentDir?.group_id ? String(currentDir.group_id) : null;

    if (targetDirGroupId && targetDirGroupId !== currentDirGroupId) {
      const nuevoGrupo = await Group.findById(targetDirGroupId).session(session);
      if (!nuevoGrupo) throw new ApiError(404, 'Grupo para dirección de grupo no encontrado.');
      if (String(nuevoGrupo.academic_year_id) !== String(input.academic_year_id)) {
        throw new ApiError(400, 'El grupo seleccionado no pertenece al año lectivo indicado.');
      }
      if (nuevoGrupo.estado !== 'ACTIVE') {
        throw new ApiError(400, `El grupo ${nuevoGrupo.nomenclatura} está cerrado.`);
      }

      for (const d of direccionesActuales) {
        if (d.group_id) {
          await Group.updateOne(
            { _id: d.group_id, director_grupo_id: docente._id },
            { $unset: { director_grupo_id: 1 } },
            { session }
          );
        }
        await TeacherAssignment.updateOne({ _id: d._id }, { $set: { estado: 'inactivo' } }, { session });
      }

      const directorAnteriorAsg = await TeacherAssignment.find({
        group_id: nuevoGrupo._id,
        tipo_asignacion: 'DIRECCION_GRUPO',
        estado: ESTADO_ACTIVO,
      }).session(session);
      if (directorAnteriorAsg.length > 0) {
        await TeacherAssignment.updateMany(
          { _id: { $in: directorAnteriorAsg.map((a) => a._id) } },
          { $set: { estado: 'inactivo' } },
          { session }
        );
      }

      nuevoGrupo.director_grupo_id = docente._id;
      await nuevoGrupo.save({ session });

      await TeacherAssignment.create(
        [
          {
            docente_id: docente._id,
            academic_year_id: input.academic_year_id,
            tipo_asignacion: 'DIRECCION_GRUPO',
            group_id: nuevoGrupo._id,
            horas_semanales: input.horas_direccion ?? 0,
            estado: 'activo',
          },
        ],
        { session }
      );
    } else if (targetDirGroupId && targetDirGroupId === currentDirGroupId && currentDir) {
      if (currentDir.horas_semanales !== (input.horas_direccion ?? 0)) {
        currentDir.horas_semanales = input.horas_direccion ?? 0;
        await currentDir.save({ session });
      }
    } else if (!targetDirGroupId && direccionesActuales.length > 0) {
      for (const d of direccionesActuales) {
        if (d.group_id) {
          await Group.updateOne(
            { _id: d.group_id, director_grupo_id: docente._id },
            { $unset: { director_grupo_id: 1 } },
            { session }
          );
        }
        await TeacherAssignment.updateOne({ _id: d._id }, { $set: { estado: 'inactivo' } }, { session });
      }
    }

    // Clases
    const clasesObjetivoMap = new Map<string, ClaseLoteInput>();
    for (const c of input.clases) {
      const key = `${c.group_id}:${c.subject_id}`;
      clasesObjetivoMap.set(key, c);
    }

    for (const actual of clasesActuales) {
      const key = `${actual.group_id}:${actual.subject_id}`;
      if (!clasesObjetivoMap.has(key)) {
        const tieneActividades = await Activity.exists({ teacher_assignment_id: actual._id }).session(session);
        if (tieneActividades) {
          throw new ApiError(
            409,
            'No se puede retirar una asignatura que ya cuenta con actividades o notas registradas (M12).'
          );
        }
        const devs = await CurricularDevelopment.find({ teacher_assignment_id: actual._id }).session(session);
        if (devs.some((d) => d.estado === 'APROBADO')) {
          throw new ApiError(
            409,
            'No se puede retirar una asignatura que ya cuenta con planeación curricular aprobada (M07).'
          );
        }
        if (devs.length > 0) {
          await CurricularDevelopment.deleteMany({ teacher_assignment_id: actual._id }).session(session);
        }
        await TeacherAssignment.findByIdAndDelete(actual._id).session(session);
      }
    }

    for (const [key, c] of clasesObjetivoMap.entries()) {
      const actual = clasesActuales.find((a) => `${a.group_id}:${a.subject_id}` === key);
      const group = await Group.findById(c.group_id).session(session);
      if (!group) throw new ApiError(404, `Grupo no encontrado.`);
      if (group.estado !== 'ACTIVE') {
        throw new ApiError(400, `El grupo ${group.nomenclatura} está cerrado.`);
      }

      const gradoConfig = studyPlan.grades.find((g) => String(g.grade_id) === String(group.grade_id));
      if (!gradoConfig) {
        throw new ApiError(400, `El grado de ${group.nomenclatura} no está configurado en el Plan de Estudios (M06).`);
      }

      const horas = horasDeAsignaturaEnGrupo(
        gradoConfig,
        String(group._id),
        String(c.subject_id),
        group.jornada_id ? String(group.jornada_id) : undefined
      );
      if (horas === undefined) {
        const sub = await Subject.findById(c.subject_id).session(session);
        throw new ApiError(
          400,
          `La asignatura "${sub?.nombre ?? c.subject_id}" no hace parte del plan de estudios de ${group.nomenclatura}.`
        );
      }

      if (actual) {
        if (actual.horas_semanales !== horas || actual.observaciones !== (c.observaciones ?? '')) {
          actual.horas_semanales = horas;
          actual.observaciones = c.observaciones ?? '';
          await actual.save({ session });
        }
      } else {
        const ocupada = await TeacherAssignment.findOne({
          academic_year_id: input.academic_year_id,
          group_id: c.group_id,
          subject_id: c.subject_id,
          tipo_asignacion: 'CLASE',
          estado: ESTADO_ACTIVO,
        }).session(session);
        if (ocupada) {
          const sub = await Subject.findById(c.subject_id).session(session);
          throw new ApiError(
            409,
            `La asignatura "${sub?.nombre ?? 'seleccionada'}" en ${group.nomenclatura} ya está asignada a otro docente.`
          );
        }

        await TeacherAssignment.create(
          [
            {
              docente_id: docente._id,
              academic_year_id: input.academic_year_id,
              tipo_asignacion: 'CLASE',
              group_id: c.group_id,
              subject_id: c.subject_id,
              horas_semanales: horas,
              observaciones: c.observaciones ?? '',
              estado: 'activo',
            },
          ],
          { session }
        );
      }
    }

    // Proyectos
    for (const p of proyectosActuales) {
      await TeacherAssignment.findByIdAndDelete(p._id).session(session);
    }
    for (const p of input.proyectos ?? []) {
      await TeacherAssignment.create(
        [
          {
            docente_id: docente._id,
            academic_year_id: input.academic_year_id,
            tipo_asignacion: 'PROYECTO_TRANSVERSAL',
            proyecto_nombre: p.proyecto_nombre,
            horas_semanales: p.horas_semanales,
            observaciones: p.observaciones ?? '',
            estado: 'activo',
          },
        ],
        { session }
      );
    }

    await registrarEvento({
      usuario_id: actor.id,
      accion: 'CARGA_DOCENTE_SINCRONIZADA_LOTE',
      entidad: 'TeacherAssignment',
      entidad_id: docente._id,
      detalle: `Carga sincronizada: ${clasesObjetivoMap.size} clases, dir: ${targetDirGroupId ? 'sí' : 'no'}, ${input.proyectos?.length ?? 0} proyectos.`,
      ip: actor.ip,
    });

    return { success: true };
  });
}

export interface AsignaturaDocenteGrupoInput {
  subject_id: string;
  docente_id?: string | null;
}

export interface GuardarMallaGrupoLoteInput {
  group_id: string;
  academic_year_id: string;
  director_grupo_id?: string | null;
  horas_direccion?: number;
  asignaciones: AsignaturaDocenteGrupoInput[];
}

export async function guardarMallaGrupoLote(
  input: GuardarMallaGrupoLoteInput,
  actor: ActorAsignacion
) {
  await asegurarAnioNoCerrado(input.academic_year_id);

  const group = await Group.findById(input.group_id);
  if (!group) throw new ApiError(404, 'Grupo no encontrado.');
  if (String(group.academic_year_id) !== String(input.academic_year_id)) {
    throw new ApiError(400, 'El grupo no pertenece al año lectivo indicado.');
  }
  if (group.estado !== 'ACTIVE') {
    throw new ApiError(400, `El grupo ${group.nomenclatura} está cerrado.`);
  }

  const studyPlan = await StudyPlan.findOne({ academic_year_id: input.academic_year_id });
  if (!studyPlan) {
    throw new ApiError(
      400,
      'Este año lectivo todavía no tiene un Plan de Estudios configurado (M06).'
    );
  }

  const gradoConfig = studyPlan.grades.find((g) => String(g.grade_id) === String(group.grade_id));
  if (!gradoConfig) {
    throw new ApiError(400, `El grado de ${group.nomenclatura} no está configurado en el Plan de Estudios (M06).`);
  }

  return runTransaction(async (session) => {
    // Dirección de Grupo
    const targetDirDocenteId = input.director_grupo_id ? String(input.director_grupo_id) : null;
    const currentDirDocenteId = group.director_grupo_id ? String(group.director_grupo_id) : null;

    if (targetDirDocenteId && targetDirDocenteId !== currentDirDocenteId) {
      const nuevoDocente = await User.findOne({ _id: targetDirDocenteId, rol: ROLES.DOCENTE }).session(session);
      if (!nuevoDocente || nuevoDocente.estado === 'inactivo') {
        throw new ApiError(400, 'El docente seleccionado para dirección de grupo no es válido o está inactivo.');
      }

      const dirAnt = await TeacherAssignment.find({
        group_id: group._id,
        tipo_asignacion: 'DIRECCION_GRUPO',
        estado: ESTADO_ACTIVO,
      }).session(session);
      if (dirAnt.length > 0) {
        await TeacherAssignment.updateMany(
          { _id: { $in: dirAnt.map((a) => a._id) } },
          { $set: { estado: 'inactivo' } },
          { session }
        );
      }

      group.director_grupo_id = nuevoDocente._id;
      await group.save({ session });

      await TeacherAssignment.create(
        [
          {
            docente_id: nuevoDocente._id,
            academic_year_id: input.academic_year_id,
            tipo_asignacion: 'DIRECCION_GRUPO',
            group_id: group._id,
            horas_semanales: input.horas_direccion ?? 0,
            estado: 'activo',
          },
        ],
        { session }
      );
    } else if (targetDirDocenteId && targetDirDocenteId === currentDirDocenteId) {
      const dirAsg = await TeacherAssignment.findOne({
        group_id: group._id,
        tipo_asignacion: 'DIRECCION_GRUPO',
        estado: ESTADO_ACTIVO,
      }).session(session);
      if (dirAsg && dirAsg.horas_semanales !== (input.horas_direccion ?? 0)) {
        dirAsg.horas_semanales = input.horas_direccion ?? 0;
        await dirAsg.save({ session });
      }
    } else if (!targetDirDocenteId && currentDirDocenteId) {
      const dirAnt = await TeacherAssignment.find({
        group_id: group._id,
        tipo_asignacion: 'DIRECCION_GRUPO',
        estado: ESTADO_ACTIVO,
      }).session(session);
      if (dirAnt.length > 0) {
        await TeacherAssignment.updateMany(
          { _id: { $in: dirAnt.map((a) => a._id) } },
          { $set: { estado: 'inactivo' } },
          { session }
        );
      }
      group.director_grupo_id = null as unknown as Types.ObjectId;
      await group.save({ session });
    }

    // Malla de Asignaturas
    const clasesActuales = await TeacherAssignment.find({
      group_id: group._id,
      academic_year_id: input.academic_year_id,
      tipo_asignacion: 'CLASE',
      estado: ESTADO_ACTIVO,
    }).session(session);

    const actualPorSub = new Map(clasesActuales.map((a) => [String(a.subject_id), a]));

    for (const item of input.asignaciones) {
      const subId = String(item.subject_id);
      const horas = horasDeAsignaturaEnGrupo(
        gradoConfig,
        String(group._id),
        subId,
        group.jornada_id ? String(group.jornada_id) : undefined
      );
      if (horas === undefined) {
        throw new ApiError(400, `La asignatura ${subId} no hace parte del plan de estudios de este grupo.`);
      }

      const actual = actualPorSub.get(subId);
      const targetDocenteId = item.docente_id ? String(item.docente_id) : null;

      if (targetDocenteId) {
        if (actual) {
          if (String(actual.docente_id) === targetDocenteId) {
            if (actual.horas_semanales !== horas) {
              actual.horas_semanales = horas;
              await actual.save({ session });
            }
          } else {
            const tieneActividades = await Activity.exists({ teacher_assignment_id: actual._id }).session(session);
            if (tieneActividades) {
              const sub = await Subject.findById(subId).session(session);
              throw new ApiError(
                409,
                `No se puede cambiar el docente de "${sub?.nombre ?? 'la asignatura'}": ya tiene notas o actividades registradas (M12).`
              );
            }
            const devs = await CurricularDevelopment.find({ teacher_assignment_id: actual._id }).session(session);
            if (devs.some((d) => d.estado === 'APROBADO')) {
              const sub = await Subject.findById(subId).session(session);
              throw new ApiError(
                409,
                `No se puede cambiar el docente de "${sub?.nombre ?? 'la asignatura'}": ya tiene planeación curricular aprobada (M07).`
              );
            }
            if (devs.length > 0) {
              await CurricularDevelopment.deleteMany({ teacher_assignment_id: actual._id }).session(session);
            }
            await TeacherAssignment.findByIdAndDelete(actual._id).session(session);

            const docenteValido = await User.findOne({ _id: targetDocenteId, rol: ROLES.DOCENTE }).session(session);
            if (!docenteValido || docenteValido.estado === 'inactivo') {
              throw new ApiError(400, 'El docente seleccionado está inactivo o no existe.');
            }

            await TeacherAssignment.create(
              [
                {
                  docente_id: docenteValido._id,
                  academic_year_id: input.academic_year_id,
                  tipo_asignacion: 'CLASE',
                  group_id: group._id,
                  subject_id: subId,
                  horas_semanales: horas,
                  estado: 'activo',
                },
              ],
              { session }
            );
          }
        } else {
          const docenteValido = await User.findOne({ _id: targetDocenteId, rol: ROLES.DOCENTE }).session(session);
          if (!docenteValido || docenteValido.estado === 'inactivo') {
            throw new ApiError(400, 'El docente seleccionado está inactivo o no existe.');
          }

          await TeacherAssignment.create(
            [
              {
                docente_id: docenteValido._id,
                academic_year_id: input.academic_year_id,
                tipo_asignacion: 'CLASE',
                group_id: group._id,
                subject_id: subId,
                horas_semanales: horas,
                estado: 'activo',
              },
            ],
            { session }
          );
        }
      } else if (!targetDocenteId && actual) {
        const tieneActividades = await Activity.exists({ teacher_assignment_id: actual._id }).session(session);
        if (tieneActividades) {
          const sub = await Subject.findById(subId).session(session);
          throw new ApiError(
            409,
            `No se puede desasignar "${sub?.nombre ?? 'la asignatura'}": ya tiene notas o actividades registradas (M12).`
          );
        }
        const devs = await CurricularDevelopment.find({ teacher_assignment_id: actual._id }).session(session);
        if (devs.some((d) => d.estado === 'APROBADO')) {
          const sub = await Subject.findById(subId).session(session);
          throw new ApiError(
            409,
            `No se puede desasignar "${sub?.nombre ?? 'la asignatura'}": ya tiene planeación curricular aprobada (M07).`
          );
        }
        if (devs.length > 0) {
          await CurricularDevelopment.deleteMany({ teacher_assignment_id: actual._id }).session(session);
        }
        await TeacherAssignment.findByIdAndDelete(actual._id).session(session);
      }
    }

    await registrarEvento({
      usuario_id: actor.id,
      accion: 'MALLA_GRUPO_SINCRONIZADA_LOTE',
      entidad: 'Group',
      entidad_id: group._id,
      detalle: `Malla de grupo ${group.nomenclatura} sincronizada: ${input.asignaciones.length} materias procesadas.`,
      ip: actor.ip,
    });

    return { success: true };
  });
}

