import { ClientSession, Types } from 'mongoose';
import { avisarDocumentoPorRevisar, avisarDocumentoRechazado } from './notificacionesEventos.service';
import {
  ESTADOS_MATRICULA_CON_FOLIO,
  ESTADOS_MATRICULA_VIVOS,
  EstadoDocumentoMatricula,
  EstadoEstudiante,
  EstadoMatricula,
  Rol,
  TipoDocumentoMatricula,
  TipoIngreso,
  NivelEducativo,
} from '../constants/enums';
import { NOMBRES_DOCUMENTO_MATRICULA } from '../constants/matriculaChecklist';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import ConfirmacionContinuidad, { DecisionContinuidad } from '../models/confirmacionContinuidad.model';
import Enrollment, { EnrollmentDocument } from '../models/enrollment.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudentProfile from '../models/studentProfile.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ESTADOS_QUE_EXIGEN_REINGRESO, SituacionEstudiante, situacionDeEstudiante } from '../utils/situacionEstudiante';
import { checklistCompleto, clavesNoPrevistas, documentosObligatoriosPendientes } from '../utils/documentosMatricula';
import { resumirLista } from '../utils/horarioCoherencia';
import { generarChecklistDesdeCatalogo, listarRequisitos } from './requisitoDocumental.service';
import { nombreDelRequisito } from '../utils/requisitosDocumentales';
import { runTransaction } from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { asegurarConfiguracion as asegurarFoliatura, asignarFolio } from './foliatura.service';
import { aprobarItemConPazYSalvo, pazYSalvoConfirmadoPrevio } from './pazYSalvo.service';
import { aplicarSalida } from './salidaMatricula.service';
import { ubicarEstudiantes } from './ubicacionEstudiante.service';
import { compararGradoElegido, Ubicacion } from '../utils/ubicacionEstudiante';
import { GrupoSugerido, sugerirGrupo } from '../utils/sugerenciaDeGrupo';
import { apoyoRegistradoEnPerfil, crearDesdeMatricula } from './solicitudApoyo.service';
import { habilitarPortalDeAcudientesDe } from './guardian.service';

// Un RETIRADO que venía matriculado libera su cupo en `aplicarSalida` (según la política de la institución); aquí llega solo quien se retira siendo PREINSCRITO.
const ESTADOS_QUE_LIBERAN_CUPO: EstadoMatricula[] = ['RETIRADO', 'ANULADO'];
const ESTADOS_TERMINALES: EstadoMatricula[] = ['RETIRADO', 'ANULADO'];

export interface CreateEnrollmentInput {
  student_id: string | Types.ObjectId;
  group_id: string | Types.ObjectId;
  academic_year_id: string | Types.ObjectId;
  tipo_ingreso: TipoIngreso;
  estado_inicial?: 'MATRICULADO_CONDICIONAL' | 'MATRICULADO_DEFINITIVO';
  documentacion_completa?: boolean;
  /**
   * Claves de los documentos que el acudiente entregó en físico y secretaría verificó al formalizar. Con este campo el estado sale solo: definitiva si
   * quedan aprobados todos los obligatorios, condicional (con acta) si falta alguno. Lo marcado queda APROBADO sin archivo (el archivo se sube después en el expediente).
   * Sin él rigen `documentacion_completa` y `estado_inicial` de siempre (procesos masivos y scripts).
   */
  documentos_entregados?: string[];
  fecha_limite_compromiso?: string | Date | null;
  forzar_sobrecupo?: boolean;
  /** Confirma que quien estaba RETIRADO o INACTIVO en M03 vuelve al colegio: la matrícula lo reactiva. */
  reingreso?: boolean;
  /** Lo que la familia declara sobre apoyos o diagnósticos previos (M16): se transcribe, sin valorar ni rotular. */
  apoyo_declarado?: { motivo_declarado: string; aporta_soporte?: boolean; observacion?: string };
  /** `Grade.numero` del último grado aprobado según el certificado: para quien no tiene historial en el sistema. */
  ultimo_grado_aprobado?: number | null;
  /** Por qué se matricula en un grado distinto al que indica su historial o su certificado (p. ej. promoción por decisión). */
  motivo_grado?: string;
}

export interface OpcionesCreacionMatricula {
  /** Compara el grado elegido con el historial y exige un motivo si no coincide. Solo lo activa el formulario de secretaría: los procesos masivos deciden el grado por su propia regla (M19). */
  verificarGrado?: boolean;
}

/**
 * Un estudiante tiene una sola matrícula viva por año lectivo. Si ya la tiene, se dice en qué grupo está y se le indica el camino
 * correcto (cambiar el grupo de la existente) en vez de crear otra con otro folio.
 */
export async function exigirSinMatriculaViva(
  studentId: string | Types.ObjectId,
  academicYearId: string | Types.ObjectId,
  session?: ClientSession
): Promise<void> {
  const existente = await Enrollment.findOne({ student_id: studentId, academic_year_id: academicYearId, estado: { $in: ESTADOS_MATRICULA_VIVOS } }).session(session ?? null);
  if (!existente) return;
  const grupo = await Group.findById(existente.group_id).select('grade_id nomenclatura').session(session ?? null);
  const grado = grupo ? await Grade.findById(grupo.grade_id).select('nombre').session(session ?? null) : null;
  const donde = grupo ? `${grado?.nombre ?? ''} ${grupo.nomenclatura}`.trim() : 'otro grupo';
  const folio = existente.folio_matricula ? `, folio ${existente.folio_matricula}` : ', aún sin folio';
  throw new ApiError(
    409,
    `El estudiante ya está matriculado en ${donde} este año (${existente.estado}${folio}). Para cambiarlo de grupo usa «Cambiar grupo» en su matrícula; no se crea una matrícula nueva.`,
    { enrollment_id: String(existente._id) }
  );
}

/**
 * Crea una matricula ya formalizada (MATRICULADO_*): reserva el cupo
 * (respetando max_capacity salvo override de ADMIN), genera el folio
 * reglamentario (libro/folio) e inicializa el checklist documental segun el
 * nivel del grado del grupo. Los documentos que secretaría marca como entregados
 * (`documentos_entregados`) quedan aprobados en físico, sin archivo (el archivo se
 * sube después, en el expediente). Si quedan todos los obligatorios, nace MATRICULADO_DEFINITIVO
 * sin acta de compromiso; si falta alguno, MATRICULADO_CONDICIONAL con su fecha límite.
 */
export async function createEnrollment(
  input: CreateEnrollmentInput,
  actor: { id: string | Types.ObjectId; rol: Rol },
  opciones: OpcionesCreacionMatricula = {}
): Promise<EnrollmentDocument> {
  const { student_id, group_id, academic_year_id, tipo_ingreso } = input;
  const marcaPorDocumento = Array.isArray(input.documentos_entregados);
  const esDefinitiva = Boolean(input.documentacion_completa || input.estado_inicial === 'MATRICULADO_DEFINITIVO');
  const estadoInicial: EstadoMatricula = esDefinitiva ? 'MATRICULADO_DEFINITIVO' : 'MATRICULADO_CONDICIONAL';
  const MENSAJE_SIN_FECHA = 'La fecha límite del acta de compromiso es obligatoria para una matrícula condicional (con documentos pendientes).';

  // Con la marca por documento el estado se conoce hasta armar el checklist (abajo); sin ella, ya se sabe.
  if (!marcaPorDocumento && estadoInicial === 'MATRICULADO_CONDICIONAL' && !input.fecha_limite_compromiso) {
    throw new ApiError(400, MENSAJE_SIN_FECHA);
  }

  const puedeForzar = Boolean(input.forzar_sobrecupo) && actor.rol === ROLES.ADMIN;

  // La configuración del Libro de Matrícula se crea antes de abrir la transacción: dentro de ella, dos primeras matrículas a la vez chocarían.
  await asegurarFoliatura();

  const matricula = await runTransaction(async (session) => {
    const student = await User.findOne({ _id: student_id, roles: ROLES.ESTUDIANTE }).session(session);
    if (!student) {
      throw new ApiError(404, 'El estudiante no existe o el usuario no tiene rol ESTUDIANTE.');
    }
    if (student.estado !== 'activo') {
      throw new ApiError(409, 'El estudiante se encuentra inactivo.');
    }

    const academicYear = await AcademicYear.findById(academic_year_id).session(session);
    if (!academicYear) {
      throw new ApiError(404, 'Año lectivo no encontrado.');
    }

    await exigirSinMatriculaViva(student_id, academic_year_id, session);

    // Un retirado o inactivo no se matricula por el camino normal: el reingreso es una decisión explícita y deja rastro.
    const perfilPrevio = await StudentProfile.findOne({ user_id: student_id }).select('estado').session(session);
    const retiradoEnElAnio = Boolean(await Enrollment.exists({ student_id, academic_year_id, estado: 'RETIRADO' }).session(session));
    const requiereReingreso = Boolean((perfilPrevio && ESTADOS_QUE_EXIGEN_REINGRESO.includes(perfilPrevio.estado)) || retiradoEnElAnio);
    if (requiereReingreso && !input.reingreso) {
      throw new ApiError(409, `El estudiante figura ${perfilPrevio?.estado === 'ACTIVO' || !perfilPrevio ? 'RETIRADO este año' : perfilPrevio.estado} en su expediente. Para matricularlo de nuevo usa el filtro «Retirados / Reingreso» y confirma la reincorporación.`);
    }

    const group = await Group.findById(group_id).session(session);
    if (!group) throw new ApiError(404, 'Grupo no encontrado.');
    if (String(group.academic_year_id) !== String(academic_year_id)) {
      throw new ApiError(400, 'El grupo no pertenece al año lectivo indicado.');
    }

    const grade = await Grade.findById(group.grade_id).session(session);
    if (!grade) throw new ApiError(404, 'Grado no encontrado.');

    const ajusteDeGrado = opciones.verificarGrado ? await verificarGradoDeMatricula({ studentId: String(student_id), academicYearId: String(academic_year_id), grade, input }) : null;

    // Check-and-reserve atomico: solo actualiza si el grupo sigue activo y aun hay cupo
    // disponible (salvo que un ADMIN autorice explicitamente la excepcion de sobrecupo — eso
    // nunca extiende a un grupo CLOSED, que es una decision operativa distinta a el aforo).
    const filtroReserva: Record<string, unknown> = { _id: group_id, academic_year_id, estado: 'ACTIVE' };
    if (!puedeForzar) filtroReserva.$expr = { $lt: ['$cupos_ocupados', '$max_capacity'] };

    const updatedGroup = await Group.findOneAndUpdate(filtroReserva, { $inc: { cupos_ocupados: 1 } }, { new: true, session });
    if (!updatedGroup) {
      throw new ApiError(409, 'El grupo seleccionado no está activo o no tiene cupos disponibles.');
    }

    const { numero_libro, numero_folio, folio_matricula } = await asignarFolio(academicYear.year, session);

    const profile = await StudentProfile.findOne({ user_id: student_id }).session(session);
    if (profile && requiereReingreso) {
      profile.estado = 'ACTIVO';
      await profile.save({ session });
    }
    const vinculoAcudiente = await StudentGuardian.findOne({ student_id, es_principal: true }).session(session);

    const itemsGenerados = await generarChecklistDesdeCatalogo({
      nivel: grade.nivel,
      numeroGrado: grade.numero,
      tipoIngreso: tipo_ingreso,
      tieneDiscapacidad: profile?.tiene_discapacidad,
      parentescoAcudiente: vinculoAcudiente?.parentesco,
    });

    // Lo que secretaría tuvo en la mano: la lista marcada documento por documento o, en los procesos masivos, todo lo obligatorio.
    // Quedan aprobados sin archivo (verificados en físico); nada se da por subido.
    const entregados = new Set(marcaPorDocumento ? input.documentos_entregados : esDefinitiva ? itemsGenerados.filter((i) => i.obligatorio).map((i) => i.tipo_documento) : []);
    const noPrevistos = clavesNoPrevistas(itemsGenerados.map((i) => i.tipo_documento), [...entregados]);
    if (noPrevistos.length > 0) {
      throw new ApiError(400, `Estos documentos no se piden en esta matrícula y no pueden marcarse como entregados: ${noPrevistos.join(', ')}.`);
    }

    const ahora = new Date();
    const checklist = itemsGenerados.map((item) => {
      const verificado = entregados.has(item.tipo_documento);
      return {
        tipo_documento: item.tipo_documento,
        nombre_personalizado: item.nombre_personalizado ?? null,
        indicacion: item.indicacion ?? null,
        categoria: item.categoria ?? null,
        obligatorio: item.obligatorio,
        estado: (verificado ? 'APROBADO' : 'PENDIENTE') as EstadoDocumentoMatricula,
        archivo_path: null,
        comentario: null,
        fecha_carga: null,
        revisado_por: verificado ? new Types.ObjectId(actor.id) : null,
        fecha_verificacion_fisica: verificado ? ahora : null,
      };
    });

    // Quien ya estudió aquí no sube de nuevo el paz y salvo si el del año anterior ya está confirmado: lo aprueba el sistema, no se vio en físico.
    const itemPazYSalvo = checklist.find((c) => c.tipo_documento === 'PAZ_Y_SALVO_ANIO_ANTERIOR');
    if (itemPazYSalvo) {
      const previo = await pazYSalvoConfirmadoPrevio(student_id, academicYear.year);
      if (previo) {
        aprobarItemConPazYSalvo(itemPazYSalvo, previo);
        itemPazYSalvo.fecha_verificacion_fisica = null;
      }
    }

    const estadoFinal: EstadoMatricula = marcaPorDocumento ? (checklistCompleto(checklist) ? 'MATRICULADO_DEFINITIVO' : 'MATRICULADO_CONDICIONAL') : estadoInicial;
    if (estadoFinal === 'MATRICULADO_CONDICIONAL' && !input.fecha_limite_compromiso) throw new ApiError(400, MENSAJE_SIN_FECHA);

    const [enrollment] = await Enrollment.create(
      [
        {
          student_id,
          group_id,
          academic_year_id,
          folio_matricula,
          numero_libro,
          numero_folio,
          tipo_ingreso,
          ultimo_grado_aprobado: input.ultimo_grado_aprobado ?? null,
          estado: estadoFinal,
          fecha_matricula: new Date(),
          fecha_limite_compromiso: estadoFinal === 'MATRICULADO_CONDICIONAL' && input.fecha_limite_compromiso ? new Date(input.fecha_limite_compromiso) : null,
          checklist,
        },
      ],
      { session }
    );
    if (!enrollment) throw new ApiError(500, 'No se pudo crear la matricula.');

    // Cambio mínimo de M16: en la misma transacción queda la solicitud en la bandeja de orientación. Lo declarado al matricular manda; si no se declara
    // nada, se usa lo que la hoja de vida ya dice de una discapacidad (no se escribe dos veces).
    const apoyo = input.apoyo_declarado ?? (await apoyoRegistradoEnPerfil(student_id, academic_year_id, session));
    if (apoyo) {
      await crearDesdeMatricula(
        {
          student_id,
          academic_year_id,
          group_id,
          origen: 'MATRICULA',
          motivo_declarado: apoyo.motivo_declarado,
          aporta_soporte: Boolean(apoyo.aporta_soporte),
          observacion: apoyo.observacion,
          solicitada_por: actor.id,
        },
        session
      );
    }

    await registrarEvento({
      usuario_id: actor.id,
      accion: 'MATRICULA_CREADA',
      entidad: 'Enrollment',
      entidad_id: enrollment._id,
      detalle: `Folio ${folio_matricula}, tipo_ingreso ${tipo_ingreso}, estado ${estadoFinal}, ${checklist.filter((c) => c.fecha_verificacion_fisica).length} documento(s) verificado(s) en físico`,
    });
    if (ajusteDeGrado) {
      await registrarEvento({
        usuario_id: actor.id,
        accion: 'MATRICULA_GRADO_CON_MOTIVO',
        entidad: 'Enrollment',
        entidad_id: enrollment._id,
        detalle: `${ajusteDeGrado.descripcion}. Motivo: ${ajusteDeGrado.motivo}`,
      });
    }
    if (requiereReingreso) {
      await registrarEvento({
        usuario_id: actor.id,
        accion: 'MATRICULA_REINGRESO',
        entidad: 'Enrollment',
        entidad_id: enrollment._id,
        detalle: `El estudiante estaba ${perfilPrevio && ESTADOS_QUE_EXIGEN_REINGRESO.includes(perfilPrevio.estado) ? perfilPrevio.estado : 'RETIRADO este año'} y se reincorporó con esta matrícula`,
      });
    }
    if (puedeForzar) {
      await registrarEvento({
        usuario_id: actor.id,
        accion: 'MATRICULA_SOBRECUPO_AUTORIZADO',
        entidad: 'Enrollment',
        entidad_id: enrollment._id,
        detalle: `Grupo ${group._id} excede max_capacity ${group.max_capacity}`,
      });
    }

    return enrollment;
  });
  await habilitarPortalSinRomper(student_id, actor.id);
  return matricula;
}

/** La matrícula confirmada abre el portal del acudiente (M27); si no se puede, la matrícula no se afecta: el motivo queda en el registro del servidor. */
async function habilitarPortalSinRomper(studentId: string | Types.ObjectId, usuarioId: string | Types.ObjectId): Promise<void> {
  try {
    const r = await habilitarPortalDeAcudientesDe(studentId, { usuarioId });
    for (const o of r.omitidos) console.warn(`[matrícula] No se abrió el portal de ${o.acudiente}: ${o.motivo}`);
  } catch (err) {
    console.error('[matrícula] No se pudo habilitar el portal del acudiente:', err);
  }
}

export interface FormalizacionOpciones {
  /** Obligatoria al formalizar como MATRICULADO_CONDICIONAL. */
  fecha_limite_compromiso?: string | Date;
}

/**
 * Cambia el estado de una matricula (formalizacion, retiro, anulacion).
 * Exige motivo para RETIRADO y ANULADO. Anular libera el cupo del grupo; retirar a quien ya estaba matriculado pasa por `aplicarSalida` (cupo según la política de la institución).
 *
 * El folio del Libro de Matricula se asigna aqui, en la transicion
 * PREINSCRITO -> MATRICULADO_*, y no antes: un aspirante que desiste no debe
 * consumir un numero oficial (dejaria un hueco en el consecutivo). Va en la
 * misma transaccion que el cambio de estado, asi que si este falla el
 * consecutivo hace rollback.
 */
export async function updateEnrollmentStatus(
  enrollmentId: string | Types.ObjectId,
  nuevoEstado: EstadoMatricula,
  motivo: string | undefined,
  actor: { id: string | Types.ObjectId },
  opciones: FormalizacionOpciones = {}
): Promise<EnrollmentDocument> {
  if ((nuevoEstado === 'RETIRADO' || nuevoEstado === 'ANULADO') && !motivo) {
    throw new ApiError(400, `Debes indicar un motivo para pasar la matrícula a ${nuevoEstado}.`);
  }
  if (ESTADOS_MATRICULA_CON_FOLIO.includes(nuevoEstado)) await asegurarFoliatura();

  const actualizada = await runTransaction(async (session) => {
    const enrollment = await Enrollment.findById(enrollmentId).session(session);
    if (!enrollment) {
      throw new ApiError(404, 'Matricula no encontrada.');
    }

    const estadoAnterior = enrollment.estado;

    if (estadoAnterior === nuevoEstado) {
      throw new ApiError(400, `La matricula ya se encuentra en estado ${nuevoEstado}.`);
    }
    if (ESTADOS_TERMINALES.includes(estadoAnterior)) {
      throw new ApiError(409, `No se puede modificar una matricula que ya esta en estado ${estadoAnterior}.`);
    }

    // Retirar a quien ya estaba matriculado es una salida (M04): deja fecha efectiva, tipo y paz y salvo. Con los datos mínimos es un retiro de hoy;
    // el registro completo (traslado, fecha anterior, institución receptora) lo hace `registrarSalida`.
    if (nuevoEstado === 'RETIRADO' && estadoAnterior !== 'PREINSCRITO') {
      await aplicarSalida(enrollment, { tipo: 'RETIRO', motivo: motivo as string }, actor, session);
      return enrollment;
    }

    // Una matricula con folio ya es un asiento del Libro: no vuelve a preinscrita.
    if (nuevoEstado === 'PREINSCRITO' && enrollment.folio_matricula) {
      throw new ApiError(409, 'Una matrícula con folio asignado no puede volver a PREINSCRITO.');
    }

    let detalleFolio = '';
    if (!enrollment.folio_matricula && ESTADOS_MATRICULA_CON_FOLIO.includes(nuevoEstado)) {
      if (nuevoEstado === 'MATRICULADO_CONDICIONAL' && !opciones.fecha_limite_compromiso) {
        throw new ApiError(400, 'fecha_limite_compromiso es obligatoria para una matrícula condicional.');
      }

      const academicYear = await AcademicYear.findById(enrollment.academic_year_id).session(session);
      if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');

      const { numero_libro, numero_folio, folio_matricula } = await asignarFolio(academicYear.year, session);
      enrollment.folio_matricula = folio_matricula;
      enrollment.numero_libro = numero_libro;
      enrollment.numero_folio = numero_folio;
      // La fecha de matricula es la de la formalizacion, no la de la preinscripcion.
      enrollment.fecha_matricula = new Date();
      const primerTramo = enrollment.trayectoria.length === 1 ? enrollment.trayectoria[0] : undefined;
      if (primerTramo) primerTramo.desde = enrollment.fecha_matricula;
      detalleFolio = ` — folio ${folio_matricula}`;
    }

    // Compuerta de documentos: sin todo lo obligatorio aprobado la matrícula queda condicional.
    if (nuevoEstado === 'MATRICULADO_DEFINITIVO') {
      const pendientes = documentosObligatoriosPendientes(enrollment.checklist);
      if (pendientes.length > 0) {
        throw new ApiError(
          409,
          `No se puede dejar la matrícula como definitiva: faltan por aprobar ${pendientes.length} documento(s) obligatorio(s): ${resumirLista(pendientes, 5)}. ` +
            'Apruébalos en el checklist y pasará sola a definitiva, o déjala como condicional con su plazo de compromiso.'
        );
      }
    }

    enrollment.estado = nuevoEstado;
    if (motivo) enrollment.motivo_retiro = motivo;
    if (nuevoEstado === 'MATRICULADO_CONDICIONAL' && opciones.fecha_limite_compromiso) {
      enrollment.fecha_limite_compromiso = new Date(opciones.fecha_limite_compromiso);
    }
    if (nuevoEstado === 'MATRICULADO_DEFINITIVO') enrollment.fecha_limite_compromiso = null;
    await enrollment.save({ session });

    if (ESTADOS_QUE_LIBERAN_CUPO.includes(nuevoEstado)) {
      await Group.findOneAndUpdate(
        { _id: enrollment.group_id, cupos_ocupados: { $gt: 0 } },
        { $inc: { cupos_ocupados: -1 } },
        { session }
      );
    }

    await registrarEvento({
      usuario_id: actor.id,
      accion: 'MATRICULA_ESTADO_CAMBIADO',
      entidad: 'Enrollment',
      entidad_id: enrollment._id,
      detalle: `${estadoAnterior} -> ${nuevoEstado}${detalleFolio}${motivo ? ` — motivo: ${motivo}` : ''}`,
    });

    return enrollment;
  });
  // Confirmada la matrícula (condicional o definitiva), el acudiente puede entrar al portal.
  if (ESTADOS_MATRICULA_CON_FOLIO.includes(nuevoEstado)) await habilitarPortalSinRomper(actualizada.student_id, actor.id);
  return actualizada;
}

/** Reasignacion/cambio de grupo (M04-D): conserva el historial de notas/asistencia, que viven en otras colecciones por group_id+fecha. */
export async function cambiarGrupo(
  enrollmentId: string | Types.ObjectId,
  nuevoGroupId: string | Types.ObjectId,
  actor: { id: string | Types.ObjectId }
): Promise<EnrollmentDocument> {
  return runTransaction(async (session) => {
    const enrollment = await Enrollment.findById(enrollmentId).session(session);
    if (!enrollment) throw new ApiError(404, 'Matricula no encontrada.');
    if (ESTADOS_TERMINALES.includes(enrollment.estado)) {
      throw new ApiError(409, `No se puede cambiar de grupo una matricula en estado ${enrollment.estado}.`);
    }
    if (String(enrollment.group_id) === String(nuevoGroupId)) {
      throw new ApiError(400, 'El estudiante ya pertenece a ese grupo.');
    }

    const nuevoGrupo = await Group.findOneAndUpdate(
      {
        _id: nuevoGroupId,
        academic_year_id: enrollment.academic_year_id,
        estado: 'ACTIVE',
        $expr: { $lt: ['$cupos_ocupados', '$max_capacity'] },
      },
      { $inc: { cupos_ocupados: 1 } },
      { new: true, session }
    );
    if (!nuevoGrupo) {
      throw new ApiError(
        409,
        'El grupo destino no está activo, no tiene cupos disponibles o no pertenece al mismo año lectivo.'
      );
    }

    const grupoAnteriorId = enrollment.group_id;
    await Group.findOneAndUpdate(
      { _id: grupoAnteriorId, cupos_ocupados: { $gt: 0 } },
      { $inc: { cupos_ocupados: -1 } },
      { session }
    );

    // La trayectoria conserva el paso por el grupo anterior: desde cuándo y hasta cuándo estuvo en cada uno.
    const ahora = new Date();
    const abierto = [...enrollment.trayectoria].reverse().find((t) => t.hasta === null);
    if (abierto) abierto.hasta = ahora;
    else enrollment.trayectoria.push({ group_id: grupoAnteriorId, desde: enrollment.fecha_matricula, hasta: ahora });
    enrollment.trayectoria.push({ group_id: nuevoGrupo._id, desde: ahora, hasta: null });
    enrollment.group_id = nuevoGrupo._id;
    await enrollment.save({ session });

    await registrarEvento({
      usuario_id: actor.id,
      accion: 'MATRICULA_GRUPO_CAMBIADO',
      entidad: 'Enrollment',
      entidad_id: enrollment._id,
      detalle: `Grupo ${grupoAnteriorId} -> ${nuevoGrupo._id}`,
    });

    return enrollment;
  });
}

export interface ListarEnrollmentsFilter {
  academic_year_id?: string;
  group_id?: string;
  estado?: EstadoMatricula;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listarEnrollments(filter: ListarEnrollmentsFilter) {
  const query: Record<string, unknown> = {};
  if (filter.academic_year_id) query.academic_year_id = filter.academic_year_id;
  if (filter.group_id) query.group_id = filter.group_id;
  if (filter.estado) query.estado = filter.estado;

  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20));

  let studentIds: Types.ObjectId[] | undefined;
  if (filter.search) {
    const regex = new RegExp(filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const estudiantes = await User.find({ $or: [{ nombre: regex }, { apellido: regex }, { numero_documento: regex }] }).select('_id');
    studentIds = estudiantes.map((e) => e._id);
    query.student_id = { $in: studentIds };
  }

  const [data, total] = await Promise.all([
    Enrollment.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('student_id', 'nombre apellido numero_documento tipo_documento')
      .populate('group_id', 'nomenclatura'),
    Enrollment.countDocuments(query),
  ]);

  return { data, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export interface SituacionDeEstudianteMatricula {
  _id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  tipo_documento: string;
  estado_expediente: EstadoEstudiante | null;
  tiene_discapacidad: boolean;
  /** Lo que respondió la familia sobre si continúa el año (M04, continuidad); null si no ha respondido. */
  continuidad: DecisionContinuidad | null;
  situacion: SituacionEstudiante;
  matricula: { _id: string; estado: EstadoMatricula; grupo: string; folio: string | null } | null;
}

/** Todos los estudiantes con su situación frente a la matrícula del año: alimenta los filtros del formulario de matrícula (sin duplicar datos). */
export async function listarSituacionEstudiantes(academicYearId: string): Promise<SituacionDeEstudianteMatricula[]> {
  const [usuarios, perfiles, vivas, retiradas, continuidades] = await Promise.all([
    User.find({ roles: ROLES.ESTUDIANTE }).select('nombre apellido numero_documento tipo_documento estado').sort({ apellido: 1, nombre: 1 }).lean(),
    StudentProfile.find().select('user_id estado tiene_discapacidad').lean(),
    Enrollment.find({ academic_year_id: academicYearId, estado: { $in: ESTADOS_MATRICULA_VIVOS } })
      .select('student_id group_id estado folio_matricula')
      .populate({ path: 'group_id', select: 'nomenclatura grade_id', populate: { path: 'grade_id', select: 'nombre' } })
      .lean(),
    Enrollment.find({ academic_year_id: academicYearId, estado: 'RETIRADO' }).distinct('student_id'),
    ConfirmacionContinuidad.find({ academic_year_id: academicYearId }).select('student_id decision').lean(),
  ]);
  const continuidadPorUsuario = new Map(continuidades.map((c) => [String(c.student_id), c.decision]));
  const retiradosEnElAnio = new Set(retiradas.map(String));
  const estadoPorUsuario = new Map(perfiles.map((p) => [String(p.user_id), p.estado]));
  const conDiscapacidad = new Set(perfiles.filter((p) => p.tiene_discapacidad).map((p) => String(p.user_id)));
  const matriculaPorUsuario = new Map(vivas.map((m) => [String(m.student_id), m]));

  return usuarios.map((u) => {
    const viva = matriculaPorUsuario.get(String(u._id));
    const estadoPerfil = estadoPorUsuario.get(String(u._id));
    const grupo = viva?.group_id as unknown as { nomenclatura: string; grade_id?: { nombre: string } } | null | undefined;
    return {
      _id: String(u._id),
      nombre: u.nombre,
      apellido: u.apellido,
      numero_documento: u.numero_documento,
      tipo_documento: u.tipo_documento,
      estado_expediente: estadoPerfil ?? null,
      tiene_discapacidad: conDiscapacidad.has(String(u._id)),
      continuidad: continuidadPorUsuario.get(String(u._id)) ?? null,
      situacion: situacionDeEstudiante({ tieneMatriculaViva: Boolean(viva), estadoPerfil, usuarioActivo: u.estado === 'activo', retiradoEnElAnio: retiradosEnElAnio.has(String(u._id)) }),
      matricula: viva
        ? {
            _id: String(viva._id),
            estado: viva.estado,
            grupo: grupo ? `${grupo.grade_id?.nombre ?? ''} ${grupo.nomenclatura}`.trim() : '—',
            folio: viva.folio_matricula ?? null,
          }
        : null,
    };
  });
}

export interface DatosFormalizacion {
  /** El acudiente trae todos los documentos obligatorios (secretaría tuvo los originales en la mano). */
  trae_todos: boolean;
  /** Obligatoria si no los trae: la matrícula queda condicional con acta de compromiso. */
  fecha_limite_compromiso?: string | Date | null;
}

/**
 * Formaliza una matrícula PREINSCRITA (la de quien se aprobó desde una solicitud o la que dejó la rematrícula) con la misma pregunta de «Nueva matrícula»:
 * con `trae_todos` cada obligatorio que no está aprobado queda aprobado —el que ya tiene archivo, tras ver el original; el que no, verificado en físico
 * sin archivo— y la matrícula pasa a definitiva; sin él queda condicional con su fecha. Asigna el folio como cualquier formalización. Si la hoja de vida
 * dice que tiene una discapacidad y ese año no hay solicitud, llega a orientación. Cada paso es idempotente: si algo falla a la mitad se puede repetir.
 */
export async function formalizarMatriculaPreinscrita(enrollmentId: string, datos: DatosFormalizacion, actor: { id: string | Types.ObjectId }): Promise<EnrollmentDocument> {
  const matricula = await Enrollment.findById(enrollmentId);
  if (!matricula) throw new ApiError(404, 'Matrícula no encontrada.');
  if (matricula.estado !== 'PREINSCRITO') throw new ApiError(409, `Solo se formaliza una matrícula preinscrita; esta está ${matricula.estado}.`);
  if (!datos.trae_todos && !datos.fecha_limite_compromiso) {
    throw new ApiError(400, 'La fecha límite del acta de compromiso es obligatoria para una matrícula condicional (con documentos pendientes).');
  }

  if (datos.trae_todos) {
    const porAprobar = matricula.checklist.filter((c) => c.obligatorio !== false && c.estado !== 'APROBADO');
    const sinArchivo = porAprobar.filter((c) => !c.archivo_path).map((c) => c.tipo_documento);
    if (sinArchivo.length > 0) await marcarVerificacionFisica(enrollmentId, sinArchivo, true, actor);
    for (const c of porAprobar.filter((x) => x.archivo_path)) {
      await revisarDocumento(enrollmentId, c.tipo_documento as TipoDocumentoMatricula, { estado: 'APROBADO' }, actor);
    }
  }

  await runTransaction(async (session) => {
    const apoyo = await apoyoRegistradoEnPerfil(matricula.student_id, matricula.academic_year_id, session);
    if (!apoyo) return;
    await crearDesdeMatricula(
      { student_id: matricula.student_id, academic_year_id: matricula.academic_year_id, group_id: matricula.group_id, origen: 'MATRICULA', ...apoyo, solicitada_por: actor.id },
      session
    );
  });

  return updateEnrollmentStatus(enrollmentId, datos.trae_todos ? 'MATRICULADO_DEFINITIVO' : 'MATRICULADO_CONDICIONAL', undefined, actor, {
    fecha_limite_compromiso: datos.trae_todos ? undefined : (datos.fecha_limite_compromiso ?? undefined),
  });
}

export interface ConsultaGrupoSugerido {
  academic_year_id: string;
  grade_id: string;
  /** Si se conoce, se prefiere la sede y la jornada de su renovación (continuidad). */
  student_id?: string;
}

/** El grupo menos lleno de un grado para matricular a alguien (sugerencia; secretaría elige). */
export async function grupoSugerido(consulta: ConsultaGrupoSugerido): Promise<{ sugerido: GrupoSugerido | null; grupos_con_cupo: number }> {
  const [grupos, renovacion] = await Promise.all([
    Group.find({ academic_year_id: consulta.academic_year_id, grade_id: consulta.grade_id, estado: 'ACTIVE' }).select('nomenclatura sede_id jornada_id max_capacity cupos_ocupados').lean(),
    consulta.student_id ? ConfirmacionContinuidad.findOne({ student_id: consulta.student_id, academic_year_id: consulta.academic_year_id, decision: 'CONTINUA' }).select('sede_id jornada_id').lean() : null,
  ]);
  const candidatos = grupos.map((g) => ({
    id: String(g._id),
    nombre: g.nomenclatura,
    sede_id: String(g.sede_id),
    jornada_id: g.jornada_id ? String(g.jornada_id) : null,
    max_capacity: g.max_capacity,
    cupos_ocupados: g.cupos_ocupados,
  }));
  return {
    sugerido: sugerirGrupo(candidatos, { sede_id: renovacion ? String(renovacion.sede_id) : null, jornada_id: renovacion?.jornada_id ? String(renovacion.jornada_id) : null }),
    grupos_con_cupo: candidatos.filter((g) => g.cupos_ocupados < g.max_capacity).length,
  };
}

/**
 * Avisa —sin bloquear— cuando el grado elegido no es el que indica el historial del estudiante (o el último grado aprobado que se declaró): pasa
 * cuando el colegio decide matricular distinto al nivel (promoción por decisión, repitencia voluntaria, un certificado que no cuadra). Quien lo
 * hace escribe el motivo, que queda en la auditoría. Devuelve null si no hay nada que comparar o el grado coincide.
 */
async function verificarGradoDeMatricula(args: {
  studentId: string;
  academicYearId: string;
  grade: { numero: number; nombre: string };
  input: CreateEnrollmentInput;
}): Promise<{ descripcion: string; motivo: string } | null> {
  const { ubicaciones, gradosExistentes, gradoPorNumero } = await ubicarEstudiantes(args.academicYearId, [args.studentId]);
  const ubicacion = ubicaciones.get(args.studentId);
  if (!ubicacion) return null;
  const veredicto = compararGradoElegido({
    gradoElegido: args.grade.numero,
    esperado: ubicacion.esperado,
    ultimoGradoAprobadoDeclarado: args.input.ultimo_grado_aprobado,
    gradosExistentes,
  });
  if (veredicto.resultado !== 'DIFIERE') return null;

  const nombreDe = (n: number | null) => (n === null ? 'ese grado' : gradoPorNumero.get(n)?.nombre ?? `grado ${n}`);
  const declarado = args.input.ultimo_grado_aprobado;
  const origen =
    declarado !== null && declarado !== undefined
      ? `el último grado aprobado que se declaró (${nombreDe(declarado)})`
      : 'su historial';
  const esperadoTexto = veredicto.esperado.lugar === 'EGRESADO' ? 'que ya terminó el último grado' : `que le corresponde ${nombreDe(veredicto.esperado.grado_numero)}`;
  const descripcion = `Matriculado en ${args.grade.nombre} aunque según ${origen} ${esperadoTexto}`;

  const motivo = args.input.motivo_grado?.trim() ?? '';
  if (motivo.length < 10) {
    throw new ApiError(
      409,
      `Según ${origen}, ${esperadoTexto}, y lo estás matriculando en ${args.grade.nombre}. Si es una decisión de la institución (por ejemplo, una promoción por decisión), escribe el motivo para matricularlo igual.`,
      { requiere_motivo_grado: true, grado_elegido: args.grade.nombre, grado_esperado: veredicto.esperado.grado_numero === null ? null : nombreDe(veredicto.esperado.grado_numero) }
    );
  }
  return { descripcion, motivo };
}

export interface UbicacionDeEstudiante extends Ubicacion {
  /** `_id` del grado de `grado_numero` (la pestaña donde aparece). */
  grado_id: string | null;
  esperado_grado_id: string | null;
  ultimo_grado_cursado_id: string | null;
}

export interface EstudiantePorGrado extends SituacionDeEstudianteMatricula {
  ubicacion: UbicacionDeEstudiante;
}

/**
 * Los estudiantes con su situación de matrícula (la misma de «Formalizar matrícula») y el grado donde les toca matricularse, derivado del cierre
 * de M19 y de las matrículas anteriores. Alimenta la lista «Por grado»: la pantalla agrupa y filtra; aquí no se guarda nada.
 */
export async function listarEstudiantesPorGrado(academicYearId: string): Promise<EstudiantePorGrado[]> {
  const situaciones = await listarSituacionEstudiantes(academicYearId);
  const { ubicaciones, gradoPorNumero } = await ubicarEstudiantes(
    academicYearId,
    situaciones.map((e) => e._id)
  );
  const idDe = (n: number | null) => (n === null ? null : gradoPorNumero.get(n)?._id ?? null);
  return situaciones.map((e) => {
    const u = ubicaciones.get(e._id) as Ubicacion;
    return { ...e, ubicacion: { ...u, grado_id: idDe(u.grado_numero), esperado_grado_id: idDe(u.esperado.grado_numero), ultimo_grado_cursado_id: idDe(u.ultimo_grado_cursado) } };
  });
}

export async function obtenerEnrollment(id: string): Promise<EnrollmentDocument> {
  const enrollment = await Enrollment.findById(id)
    .populate('student_id', 'nombre apellido numero_documento tipo_documento email')
    .populate('group_id', 'nomenclatura grade_id')
    .populate('checklist.revisado_por', 'nombre apellido');
  if (!enrollment) throw new ApiError(404, 'Matricula no encontrada.');
  return enrollment;
}

/** Quién sube el archivo. `aprobar` solo vale para el personal: significa «ya verifiqué el original», así que no queda esperando revisión. */
export interface ActorCargaDocumento {
  /** null = la familia subió el documento desde el sitio público, sin sesión. */
  id: string | Types.ObjectId | null;
  tipo: 'FAMILIA' | 'PERSONAL';
  aprobar?: boolean;
}

/** Con todo lo obligatorio aprobado, la matrícula condicional pasa sola a definitiva. Devuelve el texto de la transición (vacío si no hubo). */
function promoverSiCompleto(enrollment: EnrollmentDocument): string {
  const todoAprobado = enrollment.checklist.filter((c) => c.obligatorio !== false).every((c) => c.estado === 'APROBADO');
  if (!todoAprobado || enrollment.estado !== 'MATRICULADO_CONDICIONAL') return '';
  enrollment.estado = 'MATRICULADO_DEFINITIVO';
  enrollment.fecha_limite_compromiso = null;
  return ' — checklist completo: matrícula pasa a MATRICULADO_DEFINITIVO';
}

export async function cargarDocumento(
  enrollmentId: string,
  tipoDocumento: TipoDocumentoMatricula,
  archivoPath: string,
  actor: ActorCargaDocumento
): Promise<EnrollmentDocument> {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) throw new ApiError(404, 'Matricula no encontrada.');

  const item = enrollment.checklist.find((c) => c.tipo_documento === tipoDocumento);
  if (!item) throw new ApiError(400, 'Ese tipo de documento no aplica para esta matrícula.');

  const aprobadoAlCargar = actor.tipo === 'PERSONAL' && actor.aprobar === true && actor.id !== null;
  item.archivo_path = archivoPath;
  item.cargado_por_tipo = actor.tipo;
  item.cargado_por = actor.id ? new Types.ObjectId(actor.id) : null;
  if (item.estado !== 'APROBADO') {
    item.estado = aprobadoAlCargar ? 'APROBADO' : 'CARGADO';
    item.comentario = null;
    item.revisado_por = aprobadoAlCargar ? new Types.ObjectId(actor.id as string) : null;
  }
  item.fecha_carga = new Date();
  const transicion = aprobadoAlCargar ? promoverSiCompleto(enrollment) : '';
  await enrollment.save();

  await registrarEvento({
    usuario_id: actor.id,
    accion: 'DOCUMENTO_CARGADO',
    entidad: 'Enrollment',
    entidad_id: enrollment._id,
    detalle: `${tipoDocumento}${aprobadoAlCargar ? ' (aprobado al cargar)' : ''}${transicion}`,
  });
  if (!aprobadoAlCargar) await avisarDocumentoPorRevisar(actor.id);

  return enrollment;
}

export interface RevisarDocumentoInput {
  estado: Extract<EstadoDocumentoMatricula, 'APROBADO' | 'RECHAZADO'>;
  comentario?: string;
}

export async function revisarDocumento(
  enrollmentId: string,
  tipoDocumento: TipoDocumentoMatricula,
  input: RevisarDocumentoInput,
  actor: { id: string | Types.ObjectId }
): Promise<EnrollmentDocument> {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) throw new ApiError(404, 'Matricula no encontrada.');

  const item = enrollment.checklist.find((c) => c.tipo_documento === tipoDocumento);
  if (!item) throw new ApiError(400, 'Ese tipo de documento no aplica para el nivel de esta matrícula.');
  if (!item.archivo_path) throw new ApiError(400, 'Este documento todavía no ha sido cargado.');

  item.estado = input.estado;
  item.comentario = input.comentario ?? null;
  item.revisado_por = new Types.ObjectId(actor.id);
  // Un archivo rechazado deja sin efecto lo que se había dado por bueno al ver el original.
  if (input.estado === 'RECHAZADO') item.fecha_verificacion_fisica = null;

  const todoAprobado = enrollment.checklist
    .filter((c) => c.obligatorio !== false)
    .every((c) => c.estado === 'APROBADO');
  let transicion = '';
  if (todoAprobado && enrollment.estado === 'MATRICULADO_CONDICIONAL') {
    enrollment.estado = 'MATRICULADO_DEFINITIVO';
    enrollment.fecha_limite_compromiso = null;
    transicion = ' — checklist completo: matrícula pasa a MATRICULADO_DEFINITIVO';
  }

  await enrollment.save();

  await registrarEvento({
    usuario_id: actor.id,
    accion: 'DOCUMENTO_REVISADO',
    entidad: 'Enrollment',
    entidad_id: enrollment._id,
    detalle: `${tipoDocumento}: ${input.estado}${transicion}`,
  });
  if (input.estado === 'RECHAZADO') await avisarDocumentoRechazado(enrollment, input.comentario);

  return enrollment;
}

const nombreDelItemChecklist = (c: { tipo_documento: string; nombre_personalizado?: string | null }): string =>
  c.nombre_personalizado || NOMBRES_DOCUMENTO_MATRICULA[c.tipo_documento as keyof typeof NOMBRES_DOCUMENTO_MATRICULA] || c.tipo_documento;

/**
 * Secretaría tiene el original en la mano: da por bueno uno o varios documentos del checklist sin que haya archivo. Quedan APROBADOS sin
 * archivo; el archivo que se suba después no pasa de nuevo por revisión. Con `verificado: false` se deshace
 * una marca hecha por error, mientras el documento no tenga archivo. Todo o nada: si uno no se puede marcar, no se toca ninguno.
 */
export async function marcarVerificacionFisica(
  enrollmentId: string,
  tipos: readonly string[],
  verificado: boolean,
  actor: { id: string | Types.ObjectId }
): Promise<EnrollmentDocument> {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) throw new ApiError(404, 'Matrícula no encontrada.');
  if (ESTADOS_TERMINALES.includes(enrollment.estado)) {
    throw new ApiError(409, `No se pueden cambiar los documentos de una matrícula en estado ${enrollment.estado}.`);
  }

  const items = [...new Set(tipos)].map((tipo) => {
    const item = enrollment.checklist.find((c) => c.tipo_documento === tipo);
    if (!item) throw new ApiError(400, `El documento ${tipo} no está en el checklist de esta matrícula.`);
    return item;
  });

  for (const item of items) {
    const nombre = nombreDelItemChecklist(item);
    if (verificado) {
      if (item.estado === 'APROBADO') throw new ApiError(409, `«${nombre}» ya está aprobado.`);
      if (item.archivo_path) throw new ApiError(409, `«${nombre}» ya tiene un archivo cargado: apruébalo o recházalo desde su revisión.`);
    } else {
      if (!item.fecha_verificacion_fisica) throw new ApiError(409, `«${nombre}» no está marcado como verificado en físico.`);
      if (item.archivo_path) throw new ApiError(409, `«${nombre}» ya tiene un archivo cargado; si no es válido, recházalo.`);
    }
  }

  const ahora = new Date();
  for (const item of items) {
    item.estado = verificado ? 'APROBADO' : 'PENDIENTE';
    item.revisado_por = verificado ? new Types.ObjectId(actor.id) : null;
    item.fecha_verificacion_fisica = verificado ? ahora : null;
  }

  let transicion = '';
  if (verificado) {
    transicion = promoverSiCompleto(enrollment);
  } else if (enrollment.estado === 'MATRICULADO_DEFINITIVO' && items.some((i) => i.obligatorio !== false)) {
    // Igual que al agregar un documento obligatorio a una definitiva: vuelve a condicional (la fecha del acta se fija al generarla).
    enrollment.estado = 'MATRICULADO_CONDICIONAL';
    transicion = ' — falta un documento obligatorio: la matrícula vuelve a MATRICULADO_CONDICIONAL';
  }
  await enrollment.save();

  await registrarEvento({
    usuario_id: actor.id,
    accion: verificado ? 'DOCUMENTO_VERIFICADO_EN_FISICO' : 'DOCUMENTO_VERIFICACION_FISICA_RETIRADA',
    entidad: 'Enrollment',
    entidad_id: enrollment._id,
    detalle: `${items.map((i) => i.tipo_documento).join(', ')}${transicion}`,
  });

  return enrollment;
}

export interface AgregarDocumentoChecklistInput {
  /** Clave de un documento del catálogo. Sin ella se agrega un documento adicional con `nombre_personalizado`. */
  tipo_documento?: TipoDocumentoMatricula;
  nombre_personalizado?: string;
  obligatorio?: boolean;
}

const claveAdicional = (): string => `OTRO_${Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X')}`;

export async function agregarDocumentoChecklist(
  enrollmentId: string,
  input: AgregarDocumentoChecklistInput,
  actor: { id: string | Types.ObjectId }
): Promise<EnrollmentDocument> {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) throw new ApiError(404, 'Matrícula no encontrada.');

  let clave: string;
  let nombre: string;
  let indicacion: string | null = null;
  let categoria: string | null = null;
  let obligatorio = input.obligatorio ?? true;

  // `OTRO_DOCUMENTO` es la clave de siempre para «un documento que no está en la lista»: se trata como adicional.
  if (input.tipo_documento && input.tipo_documento !== 'OTRO_DOCUMENTO') {
    const [requisito] = (await listarRequisitos({ estado: 'activo' })).filter((r) => r.clave === input.tipo_documento);
    if (!requisito) throw new ApiError(400, 'Ese documento no está en el catálogo del colegio o está desactivado.');
    if (enrollment.checklist.some((c) => c.tipo_documento === requisito.clave)) throw new ApiError(400, 'Ese documento ya existe en el checklist de esta matrícula.');
    clave = requisito.clave;
    const grupo = await Group.findById(enrollment.group_id).select('grade_id');
    const grado = grupo ? await Grade.findById(grupo.grade_id).select('numero') : null;
    nombre = input.nombre_personalizado?.trim() || nombreDelRequisito(requisito.nombre, grado?.numero ?? 0);
    indicacion = requisito.indicacion || null;
    categoria = requisito.categoria;
    obligatorio = input.obligatorio ?? requisito.obligatorio;
  } else {
    nombre = input.nombre_personalizado?.trim() ?? '';
    if (!nombre) throw new ApiError(400, 'Escribe el nombre del documento adicional.');
    clave = claveAdicional();
    categoria = 'INSTITUCIONAL';
  }

  enrollment.checklist.push({
    tipo_documento: clave,
    nombre_personalizado: nombre,
    indicacion,
    categoria,
    obligatorio,
    estado: 'PENDIENTE',
    archivo_path: null,
    comentario: null,
    fecha_carga: null,
    revisado_por: null,
  } as unknown as (typeof enrollment.checklist)[number]);

  if (enrollment.estado === 'MATRICULADO_DEFINITIVO' && obligatorio) {
    enrollment.estado = 'MATRICULADO_CONDICIONAL';
  }

  await enrollment.save();

  await registrarEvento({
    usuario_id: actor.id,
    accion: 'DOCUMENTO_CHECKLIST_AGREGADO',
    entidad: 'Enrollment',
    entidad_id: enrollment._id,
    detalle: nombre,
  });

  return enrollment;
}

export async function eliminarDocumentoChecklist(
  enrollmentId: string,
  tipoDocumento: TipoDocumentoMatricula,
  actor: { id: string | Types.ObjectId }
): Promise<EnrollmentDocument> {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) throw new ApiError(404, 'Matrícula no encontrada.');

  const idx = enrollment.checklist.findIndex((c) => c.tipo_documento === tipoDocumento);
  if (idx === -1) throw new ApiError(404, 'Documento no encontrado en el checklist.');

  enrollment.checklist.splice(idx, 1);

  const todoAprobado = enrollment.checklist
    .filter((c) => c.obligatorio !== false)
    .every((c) => c.estado === 'APROBADO');

  if (todoAprobado && enrollment.estado === 'MATRICULADO_CONDICIONAL') {
    enrollment.estado = 'MATRICULADO_DEFINITIVO';
    enrollment.fecha_limite_compromiso = null;
  }

  await enrollment.save();

  await registrarEvento({
    usuario_id: actor.id,
    accion: 'DOCUMENTO_CHECKLIST_ELIMINADO',
    entidad: 'Enrollment',
    entidad_id: enrollment._id,
    detalle: tipoDocumento,
  });

  return enrollment;
}

export async function sincronizarRequisitosMatricula(
  enrollmentId: string,
  actor: { id: string | Types.ObjectId }
): Promise<EnrollmentDocument> {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) throw new ApiError(404, 'Matrícula no encontrada.');

  const group = await Group.findById(enrollment.group_id);
  if (!group) throw new ApiError(404, 'Grupo no encontrado.');

  const grade = await Grade.findById(group.grade_id);
  if (!grade) throw new ApiError(404, 'Grado no encontrado.');

  const profile = await StudentProfile.findOne({ user_id: enrollment.student_id });
  const vinculoAcudiente = await StudentGuardian.findOne({ student_id: enrollment.student_id, es_principal: true });

  const itemsEsperados = await generarChecklistDesdeCatalogo({
    nivel: grade.nivel,
    numeroGrado: grade.numero,
    tipoIngreso: enrollment.tipo_ingreso,
    tieneDiscapacidad: profile?.tiene_discapacidad,
    parentescoAcudiente: vinculoAcudiente?.parentesco,
  });

  let agregados = 0;
  for (const item of itemsEsperados) {
    const yaExiste = enrollment.checklist.some((c) => c.tipo_documento === item.tipo_documento);
    if (!yaExiste) {
      enrollment.checklist.push({
        tipo_documento: item.tipo_documento,
        nombre_personalizado: item.nombre_personalizado ?? null,
        indicacion: item.indicacion ?? null,
        categoria: item.categoria ?? null,
        obligatorio: item.obligatorio,
        estado: 'PENDIENTE',
        archivo_path: null,
        comentario: null,
        fecha_carga: null,
        revisado_por: null,
      } as unknown as (typeof enrollment.checklist)[number]);
      agregados++;

      if (item.tipo_documento === 'PAZ_Y_SALVO_ANIO_ANTERIOR') {
        const anio = await AcademicYear.findById(enrollment.academic_year_id).select('year');
        const previo = anio ? await pazYSalvoConfirmadoPrevio(enrollment.student_id, anio.year) : null;
        const agregado = enrollment.checklist[enrollment.checklist.length - 1];
        if (previo && agregado) aprobarItemConPazYSalvo(agregado, previo);
      }
    }
  }

  if (agregados > 0) {
    const todoAprobado = enrollment.checklist
      .filter((c) => c.obligatorio !== false)
      .every((c) => c.estado === 'APROBADO');

    if (!todoAprobado && enrollment.estado === 'MATRICULADO_DEFINITIVO') {
      enrollment.estado = 'MATRICULADO_CONDICIONAL';
    }

    await enrollment.save();

    await registrarEvento({
      usuario_id: actor.id,
      accion: 'MATRICULA_REQUISITOS_SINCRONIZADOS',
      entidad: 'Enrollment',
      entidad_id: enrollment._id,
      detalle: `Se incorporaron ${agregados} documentos faltantes según normativa del grado.`,
    });
  }

  return enrollment;
}

export async function actualizarComentarioDocumento(
  enrollmentId: string,
  tipoDocumento: TipoDocumentoMatricula,
  comentario: string | null,
  actor: { id: string | Types.ObjectId }
): Promise<EnrollmentDocument> {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) throw new ApiError(404, 'Matricula no encontrada.');

  const item = enrollment.checklist.find((c) => c.tipo_documento === tipoDocumento);
  if (!item) throw new ApiError(400, 'Ese tipo de documento no aplica para el checklist de esta matrícula.');

  item.comentario = comentario && comentario.trim() ? comentario.trim() : null;
  await enrollment.save();

  await registrarEvento({
    usuario_id: actor.id,
    accion: 'OBSERVACION_CHECKLIST_ACTUALIZADA',
    entidad: 'Enrollment',
    entidad_id: enrollment._id,
    detalle: `${tipoDocumento}: observación actualizada -> ${item.comentario || '(vacía)'}`,
  });

  return enrollment;
}

export interface FiltroDocumentosPrevistos {
  group_id?: string;
  /** Sin grupo (una inscripción todavía no lo tiene): el grado del que se piden los documentos. */
  grade_id?: string;
  tipo_ingreso: TipoIngreso;
  student_id?: string;
}

/**
 * Los documentos que se le pedirán a un estudiante antes de crear la matrícula: es la misma función que arma el checklist
 * al crearla, así que lo que se ve en el formulario es lo que luego se encuentra en el expediente. Con `student_id` se
 * tienen en cuenta su discapacidad y el parentesco de su acudiente principal; sin él, solo grado e ingreso. Si aún no
 * se selecciona grupo, retorna los requisitos base del tipo de ingreso.
 */
export async function listarDocumentosPrevistos(filtro: FiltroDocumentosPrevistos) {
  let nivel: NivelEducativo = 'PRIMARIA';
  let numeroGrado = 1;
  let anioId: Types.ObjectId | null = null;

  if (filtro.group_id) {
    const group = await Group.findById(filtro.group_id);
    if (group) {
      anioId = group.academic_year_id;
      const grade = await Grade.findById(group.grade_id);
      if (grade) {
        nivel = grade.nivel;
        numeroGrado = grade.numero;
      }
    }
  } else if (filtro.grade_id) {
    const grade = await Grade.findById(filtro.grade_id);
    if (grade) {
      nivel = grade.nivel;
      numeroGrado = grade.numero;
    }
  }

  const [profile, vinculoAcudiente] = filtro.student_id
    ? await Promise.all([
        StudentProfile.findOne({ user_id: filtro.student_id }),
        StudentGuardian.findOne({ student_id: filtro.student_id, es_principal: true }),
      ])
    : [null, null];

  const items = await generarChecklistDesdeCatalogo({
    nivel,
    numeroGrado,
    tipoIngreso: filtro.tipo_ingreso,
    tieneDiscapacidad: profile?.tiene_discapacidad,
    parentescoAcudiente: vinculoAcudiente?.parentesco,
  });

  // El paz y salvo del año anterior ya confirmado lo aprueba el sistema al matricular: no hay nada que marcar como entregado.
  let pazYSalvoCubierto = false;
  if (filtro.student_id && anioId && items.some((i) => i.tipo_documento === 'PAZ_Y_SALVO_ANIO_ANTERIOR')) {
    const anio = await AcademicYear.findById(anioId).select('year');
    pazYSalvoCubierto = Boolean(anio && (await pazYSalvoConfirmadoPrevio(filtro.student_id, anio.year)));
  }

  return items.map((item) => ({
    tipo_documento: item.tipo_documento,
    nombre: item.nombre_personalizado,
    indicacion: item.indicacion,
    categoria: item.categoria,
    obligatorio: item.obligatorio,
    ya_cubierto: pazYSalvoCubierto && item.tipo_documento === 'PAZ_Y_SALVO_ANIO_ANTERIOR',
  }));
}

export interface FiltroDocumentosPorRevisar {
  /** Solo lo que subió la familia o solo lo que subió el personal. */
  subido_por?: 'FAMILIA' | 'PERSONAL';
  academic_year_id?: string;
  group_id?: string;
  page?: number;
  limit?: number;
}

/**
 * Bandeja de secretaría: los documentos que ya subieron (CARGADO) y nadie ha revisado, del más antiguo al más reciente.
 * Una fila por documento, no por matrícula, para revisar de corrido sin entrar a cada expediente.
 */
export async function listarDocumentosPorRevisar(filtro: FiltroDocumentosPorRevisar) {
  const page = Math.max(1, filtro.page ?? 1);
  const limit = Math.min(100, Math.max(1, filtro.limit ?? 25));

  const match: Record<string, unknown> = { estado: { $nin: ESTADOS_TERMINALES }, 'checklist.estado': 'CARGADO' };
  const subidoPor = filtro.subido_por ? { 'checklist.cargado_por_tipo': filtro.subido_por } : {};
  if (filtro.academic_year_id) match.academic_year_id = new Types.ObjectId(filtro.academic_year_id);
  if (filtro.group_id) match.group_id = new Types.ObjectId(filtro.group_id);

  const [resultado] = await Enrollment.aggregate<{ filas: Array<Record<string, unknown>>; total: Array<{ n: number }> }>([
    { $match: match },
    { $unwind: '$checklist' },
    { $match: { 'checklist.estado': 'CARGADO', ...subidoPor } },
    {
      $facet: {
        total: [{ $count: 'n' }],
        filas: [
          { $sort: { 'checklist.fecha_carga': 1, _id: 1 } },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $lookup: { from: 'users', localField: 'student_id', foreignField: '_id', as: 'estudiante' } },
          { $lookup: { from: 'groups', localField: 'group_id', foreignField: '_id', as: 'grupo' } },
          { $lookup: { from: 'users', localField: 'checklist.cargado_por', foreignField: '_id', as: 'cargador' } },
          {
            $project: {
              _id: 0,
              enrollment_id: '$_id',
              estado_matricula: '$estado',
              tipo_ingreso: 1,
              tipo_documento: '$checklist.tipo_documento',
              nombre_personalizado: '$checklist.nombre_personalizado',
              obligatorio: '$checklist.obligatorio',
              fecha_carga: '$checklist.fecha_carga',
              cargado_por_tipo: '$checklist.cargado_por_tipo',
              cargado_por_nombre: { $concat: [{ $ifNull: [{ $arrayElemAt: ['$cargador.nombre', 0] }, ''] }, ' ', { $ifNull: [{ $arrayElemAt: ['$cargador.apellido', 0] }, ''] }] },
              nombre: { $arrayElemAt: ['$estudiante.nombre', 0] },
              apellido: { $arrayElemAt: ['$estudiante.apellido', 0] },
              numero_documento: { $arrayElemAt: ['$estudiante.numero_documento', 0] },
              grupo: { $arrayElemAt: ['$grupo.nomenclatura', 0] },
            },
          },
        ],
      },
    },
  ]);

  const total = resultado?.total[0]?.n ?? 0;
  return { data: resultado?.filas ?? [], total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}
