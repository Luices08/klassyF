import fs from 'fs/promises';
import { avisarEntregaNueva } from './notificacionesEventos.service';
import path from 'path';
import { Types } from 'mongoose';
import { EstadoActividadEstudiante, FORMATOS_EVIDENCIA, MAX_ARCHIVOS_POR_ENTREGA } from '../constants/actividades';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import Activity from '../models/activity.model';
import ActivitySubmission, { IActivitySubmission, IArchivoEntrega, IIntentoEntrega } from '../models/activitySubmission.model';
import Enrollment from '../models/enrollment.model';
import PeriodLock from '../models/periodLock.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { estadoDeEntrega, evaluarVentanaEntrega } from '../utils/actividades';
import { finDelDia, inicioDelDia } from '../utils/calendarioAcademico';
import { intentoConsiderado, motivoSinEntrega, requiereElegirIntento } from '../utils/entregasActividad';
import { sanitizarContenido, textoPlano } from '../utils/contenidoActividad';
import { detectarEvidencia } from '../utils/evidenciasActividad';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { carpetaActividad } from '../utils/uploadPaths';
import { ActividadPlana, VistaActividad, armarVistas, asignacionDelDocente } from './activity.service';
import { exigirAccesoALaActividad } from './actividadPermisos.service';
import { registrarEvento } from './audit.service';
import { fechaDeClase } from './attendance.service';
import { assertPeriodNotLocked } from './periodLock.service';
import { exigirPlanillaAbierta } from './notasEstado.service';
import { asegurarAnioNoCerrado } from './academicYear.service';

export interface ArchivoSubido {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

type EntregaPlana = IActivitySubmission & { _id: Types.ObjectId };

/**
 * Los intentos de una entrega. Las anteriores a las entregas múltiples guardan su único archivo en los campos de arriba y no
 * tienen `intentos`: se leen como un solo intento, el número 1.
 */
export function intentosDe(entrega: EntregaPlana | null): IIntentoEntrega[] {
  if (!entrega) return [];
  if (entrega.intentos && entrega.intentos.length > 0) return entrega.intentos;
  if (!entrega.fecha_entrega) return [];
  return [
    {
      numero: 1,
      texto_entrega: entrega.texto_entrega ?? '',
      respuesta_html: '',
      archivos: [],
      archivo_path: entrega.archivo_path ?? null,
      archivo_nombre: entrega.archivo_nombre ?? null,
      archivo_formato: entrega.archivo_formato ?? null,
      archivo_bytes: entrega.archivo_bytes ?? null,
      fecha_entrega: entrega.fecha_entrega,
      con_retraso: entrega.con_retraso ?? false,
      acceso_especial: false,
    },
  ];
}

/** Los archivos de un intento. Los anteriores a las entregas con varios archivos solo guardan uno en los campos `archivo_*`. */
export function archivosDe(intento: Pick<IIntentoEntrega, 'archivos' | 'archivo_path' | 'archivo_nombre' | 'archivo_formato' | 'archivo_bytes'>): IArchivoEntrega[] {
  if (intento.archivos && intento.archivos.length > 0) return intento.archivos;
  if (!intento.archivo_path) return [];
  return [
    {
      path: intento.archivo_path,
      nombre: intento.archivo_nombre ?? 'entrega',
      formato: intento.archivo_formato ?? 'PDF',
      bytes: intento.archivo_bytes ?? 0,
    },
  ];
}

/** La entrega tal como viaja por la API: nunca la ruta en disco, solo si hay archivo y cómo se llama. */
export function vistaEntrega(entrega: EntregaPlana | null) {
  if (!entrega) return null;
  const intentos = intentosDe(entrega);
  const considerado = intentoConsiderado(intentos, entrega.intento_valido);
  const ultimaNota = [...(entrega.historial_notas ?? [])].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())[0];
  return {
    _id: String(entrega._id),
    estado: estadoDeEntrega(entrega),
    fecha_entrega: entrega.fecha_entrega ?? null,
    con_retraso: entrega.con_retraso ?? false,
    texto_entrega: considerado?.texto_entrega ?? entrega.texto_entrega ?? '',
    tiene_archivo: Boolean(considerado?.archivo_path ?? entrega.archivo_path),
    archivo_nombre: considerado?.archivo_nombre ?? entrega.archivo_nombre ?? null,
    archivo_formato: considerado?.archivo_formato ?? entrega.archivo_formato ?? null,
    calificacion_numerica: entrega.calificacion_numerica ?? null,
    retroalimentacion: entrega.retroalimentacion ?? '',
    fecha_calificacion: entrega.fecha_calificacion ?? null,
    intentos: intentos.map((i) => ({
      numero: i.numero,
      fecha_entrega: i.fecha_entrega,
      con_retraso: i.con_retraso,
      acceso_especial: i.acceso_especial ?? false,
      texto_entrega: i.texto_entrega ?? '',
      respuesta_html: i.respuesta_html ?? '',
      tiene_archivo: archivosDe(i).length > 0,
      archivo_nombre: archivosDe(i)[0]?.nombre ?? null,
      archivo_formato: archivosDe(i)[0]?.formato ?? null,
      archivos: archivosDe(i).map((a, indice) => ({ indice, nombre: a.nombre, formato: a.formato, bytes: a.bytes })),
      considerado: considerado?.numero === i.numero,
    })),
    intento_valido: entrega.intento_valido ?? null,
    requiere_elegir_intento: requiereElegirIntento(intentos, entrega.intento_valido),
    // La nota que se ve aquí también se puede poner desde la planilla de notas: de dónde vino el último cambio.
    ultimo_cambio_nota: ultimaNota ? { origen: ultimaNota.origen ?? 'ACTIVIDAD', fecha: ultimaNota.fecha } : null,
  };
}

// --- Bandeja del estudiante (CU-EST-03) ---

export interface FiltrosMisActividades {
  subject_id?: string;
  estado?: EstadoActividadEstudiante;
  periodo?: number;
  /** YYYY-MM-DD, sobre la fecha de entrega. */
  desde?: string;
  hasta?: string;
}

function periodoCerrado(anio: AcademicYearDocument, periodo: number): boolean {
  return anio.periodos.find((p) => p.numero === periodo)?.estado === 'CERRADO';
}

/** Por qué el periodo ya no admite entregas (cerrado para todo el año o solo para el grupo); null si las admite. */
function motivoDePeriodo(anio: AcademicYearDocument, periodo: number, cerradoParaGrupo: boolean): string | null {
  if (periodoCerrado(anio, periodo)) return `El periodo ${periodo} está cerrado; ya no se reciben entregas.`;
  if (cerradoParaGrupo) return `El periodo ${periodo} está cerrado para tu grupo; ya no se reciben entregas.`;
  return null;
}

/** El plazo personal que el docente le dio a ESTE estudiante, si lo hay. */
function accesoEspecialDe(actividad: Pick<ActividadPlana, 'accesos_especiales'>, estudianteId: Types.ObjectId | string) {
  return (actividad.accesos_especiales ?? []).find((a) => String(a.student_id) === String(estudianteId)) ?? null;
}

interface ContextoDeBloqueo {
  anio: AcademicYearDocument;
  /** `${grupo}|${periodo}` de los periodos cerrados para un grupo (PeriodLock). */
  cerradosPorGrupo: Set<string>;
}

/** Lo que el estudiante necesita para decidir si entrega: su estado, si el plazo sigue abierto y por qué no. */
function vistaParaEstudiante(
  vista: VistaActividad,
  actividad: ActividadPlana,
  entrega: EntregaPlana | null,
  contexto: ContextoDeBloqueo,
  estudianteId: Types.ObjectId,
  ahora: Date
) {
  const estado = estadoDeEntrega(entrega);
  const acceso = accesoEspecialDe(actividad, estudianteId);
  const ventana = evaluarVentanaEntrega(vista, ahora, acceso?.fecha_limite);
  const grupoId = vista.asignacion?.grupo?._id ?? '';
  const intentos = intentosDe(entrega);

  const motivoBloqueo = motivoSinEntrega({
    requiere_entrega: vista.requiere_entrega,
    cerrada: vista.cerrada,
    estado,
    intentos: intentos.length,
    permite_multiples_entregas: vista.permite_multiples_entregas,
    motivo_periodo: motivoDePeriodo(contexto.anio, vista.periodo_numero, contexto.cerradosPorGrupo.has(`${grupoId}|${vista.periodo_numero}`)),
    ventana,
  });

  return {
    ...vista,
    estado,
    puede_entregar: motivoBloqueo === null,
    motivo_bloqueo: motivoBloqueo,
    acceso_especial: acceso ? { fecha_limite: acceso.fecha_limite } : null,
    entrega: vistaEntrega(entrega),
  };
}

async function anioEnCurso(): Promise<AcademicYearDocument | null> {
  return AcademicYear.findOne({ estado: 'EN_CURSO' });
}

async function asignacionesDelEstudiante(estudianteId: Types.ObjectId, anio: AcademicYearDocument, subjectId?: string) {
  const matriculas = await Enrollment.find({
    student_id: estudianteId,
    academic_year_id: anio._id,
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  })
    .select('group_id')
    .lean();
  if (matriculas.length === 0) return [];

  return TeacherAssignment.find({
    group_id: { $in: matriculas.map((m) => m.group_id) },
    academic_year_id: anio._id,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
    ...(subjectId ? { subject_id: subjectId } : {}),
  })
    .select('_id group_id')
    .lean();
}

async function contextoDeBloqueo(anio: AcademicYearDocument, grupos: Array<Types.ObjectId | undefined | null>): Promise<ContextoDeBloqueo> {
  const ids = [...new Set(grupos.filter((g): g is Types.ObjectId => Boolean(g)).map(String))];
  const bloqueos = ids.length
    ? await PeriodLock.find({ academic_year_id: anio._id, group_id: { $in: ids }, estado: 'CERRADO' }).select('group_id periodo_numero').lean()
    : [];
  return { anio, cerradosPorGrupo: new Set(bloqueos.map((b) => `${String(b.group_id)}|${b.periodo_numero}`)) };
}

/** Las actividades publicadas de las clases del grupo del estudiante, con su entrega; la más próxima a vencer primero. */
export async function listarMisActividades(estudiante: UserDocument, filtros: FiltrosMisActividades) {
  const anio = await anioEnCurso();
  if (!anio) return [];

  const asignaciones = await asignacionesDelEstudiante(estudiante._id, anio, filtros.subject_id);
  if (asignaciones.length === 0) return [];

  const ahora = new Date();
  const actividades = (await Activity.find({
    teacher_assignment_id: { $in: asignaciones.map((a) => a._id) },
    fecha_apertura: { $lte: ahora },
    ...(filtros.periodo ? { periodo_numero: filtros.periodo } : {}),
    ...(filtros.desde || filtros.hasta
      ? {
          fecha_entrega: {
            ...(filtros.desde ? { $gte: inicioDelDia(fechaDeClase(filtros.desde)) } : {}),
            ...(filtros.hasta ? { $lte: finDelDia(fechaDeClase(filtros.hasta)) } : {}),
          },
        }
      : {}),
  })
    .sort({ fecha_entrega: 1 })
    .lean()) as unknown as ActividadPlana[];

  const [vistas, entregas, contexto] = await Promise.all([
    armarVistas(actividades, ahora),
    ActivitySubmission.find({ activity_id: { $in: actividades.map((a) => a._id) }, student_id: estudiante._id }).lean(),
    contextoDeBloqueo(anio, asignaciones.map((a) => a.group_id)),
  ]);
  const entregaDe = new Map(entregas.map((e) => [String(e.activity_id), e as unknown as EntregaPlana]));
  const actividadDe = new Map(actividades.map((a) => [String(a._id), a]));

  const resultado = vistas.map((v) =>
    vistaParaEstudiante(v, actividadDe.get(v._id) as ActividadPlana, entregaDe.get(v._id) ?? null, contexto, estudiante._id, ahora)
  );
  return filtros.estado ? resultado.filter((r) => r.estado === filtros.estado) : resultado;
}

export async function detalleParaEstudiante(id: string, estudiante: UserDocument) {
  const anio = await anioEnCurso();
  const actividad = (await Activity.findById(id).lean()) as unknown as ActividadPlana | null;
  // "No existe", "no es de tu grupo" y "aún no se publica" responden igual: no se revela lo que el estudiante no ve.
  if (!anio || !actividad || actividad.fecha_apertura > new Date()) throw new ApiError(404, 'Actividad no encontrada.');

  const propias = await asignacionesDelEstudiante(estudiante._id, anio);
  if (!propias.some((a) => String(a._id) === String(actividad.teacher_assignment_id))) {
    throw new ApiError(404, 'Actividad no encontrada.');
  }

  const [[vista], entrega, contexto] = await Promise.all([
    armarVistas([actividad], new Date(), true),
    ActivitySubmission.findOne({ activity_id: actividad._id, student_id: estudiante._id }).lean(),
    contextoDeBloqueo(anio, propias.map((a) => a.group_id)),
  ]);
  return vistaParaEstudiante(vista as VistaActividad, actividad, entrega as unknown as EntregaPlana | null, contexto, estudiante._id, new Date());
}

// --- Entrega de evidencias (CU-EST-03) ---

export interface RegistrarEntregaInput {
  texto_entrega?: string;
  respuesta_html?: string;
}

/**
 * Registra la entrega del estudiante y marca sola la transición de estado: a tiempo -> ENTREGADA, pasado el plazo en una
 * actividad que lo admite -> ENTREGADA_TARDE (un acceso especial no cuenta como tardía). Solo se entrega una vez, salvo que la
 * actividad permita entregas múltiples: entonces cada entrega es un intento nuevo y el docente elige cuál califica. Con
 * formatos definidos exige un archivo de uno de ellos; sin formatos, la respuesta es el texto.
 */
export async function registrarEntrega(
  activityId: string,
  input: RegistrarEntregaInput,
  archivoOArchivos: ArchivoSubido | ArchivoSubido[] | undefined,
  estudiante: UserDocument,
  ip?: string | null
) {
  const archivos = Array.isArray(archivoOArchivos) ? archivoOArchivos : archivoOArchivos ? [archivoOArchivos] : [];
  const actividad = await Activity.findById(activityId);
  if (!actividad) throw new ApiError(404, 'Actividad no encontrada.');
  const asignacion = await TeacherAssignment.findById(actividad.teacher_assignment_id);
  if (!asignacion) throw new ApiError(404, 'Asignacion academica asociada no encontrada.');

  const anio = await AcademicYear.findById(asignacion.academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (anio.estado !== 'EN_CURSO') throw new ApiError(409, `El año lectivo ${anio.year} no está vigente; no se reciben entregas.`);

  const matricula = await Enrollment.exists({
    student_id: estudiante._id,
    group_id: asignacion.group_id,
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  });
  if (!matricula) throw new ApiError(403, 'El estudiante no esta matriculado en el grupo de esta actividad.');

  const ahora = new Date();
  const acceso = accesoEspecialDe(actividad, estudiante._id);
  const ventana = evaluarVentanaEntrega(
    { fecha_apertura: actividad.fecha_apertura, fecha_entrega: actividad.fecha_entrega, permite_entrega_tardia: actividad.permite_entrega_tardia ?? false },
    ahora,
    acceso?.fecha_limite
  );
  if (!ventana.publicada) throw new ApiError(404, 'Actividad no encontrada.');

  const previa = (await ActivitySubmission.findOne({ activity_id: actividad._id, student_id: estudiante._id }).lean()) as unknown as EntregaPlana | null;
  const intentosPrevios = intentosDe(previa);
  const cerradoParaGrupo = Boolean(
    await PeriodLock.exists({ academic_year_id: anio._id, group_id: asignacion.group_id, periodo_numero: actividad.periodo_numero, estado: 'CERRADO' })
  );
  const motivo = motivoSinEntrega({
    requiere_entrega: actividad.requiere_entrega ?? true,
    cerrada: actividad.cerrada ?? false,
    estado: estadoDeEntrega(previa),
    intentos: intentosPrevios.length,
    permite_multiples_entregas: actividad.permite_multiples_entregas ?? false,
    motivo_periodo: motivoDePeriodo(anio, actividad.periodo_numero, cerradoParaGrupo),
    ventana,
  });
  if (motivo) throw new ApiError(409, motivo);

  const formatos = actividad.formatos_permitidos ?? [];
  const texto = input.texto_entrega?.trim() ?? '';
  const conEditor = actividad.permite_editor_texto ?? false;
  const respuestaHtml = conEditor && input.respuesta_html ? sanitizarContenido(input.respuesta_html) : '';
  const hayRespuestaEscrita = respuestaHtml !== '' && (textoPlano(respuestaHtml) !== '' || /<img\b/i.test(respuestaHtml));
  const maxArchivos = actividad.permite_varios_archivos ? MAX_ARCHIVOS_POR_ENTREGA : 1;
  const datosArchivos: IArchivoEntrega[] = [];
  const destinos: string[] = [];

  if (formatos.length === 0) {
    if (archivos.length > 0) throw new ApiError(400, 'Esta actividad se responde por escrito: no recibe archivos.');
    if (!texto && !hayRespuestaEscrita) throw new ApiError(400, 'Escribe tu respuesta para entregar la actividad.');
  } else {
    if (archivos.length === 0 && !hayRespuestaEscrita) {
      throw new ApiError(400, conEditor ? 'Adjunta tu archivo o escribe tu respuesta para entregar.' : 'Adjunta el archivo de tu entrega.');
    }
    if (archivos.length > maxArchivos) {
      throw new ApiError(400, maxArchivos === 1 ? 'Esta actividad recibe un solo archivo por entrega.' : `Una entrega admite hasta ${MAX_ARCHIVOS_POR_ENTREGA} archivos.`);
    }
    // El mimetype lo declara el cliente: la firma de bytes decide qué es cada archivo y de ahí sale la extensión.
    const evidencias = archivos.map((archivo) => {
      const evidencia = detectarEvidencia(archivo.mimetype, archivo.originalname, archivo.buffer);
      if (!evidencia) throw new ApiError(400, 'El archivo no es un PDF, Word, Excel, PowerPoint o imagen válido.');
      if (!formatos.includes(evidencia.formato)) {
        throw new ApiError(400, `Esta actividad solo acepta: ${formatos.map((f) => FORMATOS_EVIDENCIA[f].etiqueta).join(', ')}.`);
      }
      return evidencia;
    });

    if (archivos.length > 0) {
      const carpeta = carpetaActividad(String(actividad._id));
      await fs.mkdir(carpeta, { recursive: true });
      for (const [indice, archivo] of archivos.entries()) {
        const evidencia = evidencias[indice]!;
        const destino = path.join(carpeta, `${String(estudiante._id)}-${ahora.getTime()}-${indice}${evidencia.ext}`);
        await fs.writeFile(destino, archivo.buffer);
        destinos.push(destino);
        datosArchivos.push({
          path: path.relative(process.cwd(), destino),
          nombre: archivo.originalname.slice(0, 120),
          formato: evidencia.formato,
          bytes: archivo.buffer.length,
        });
      }
    }
  }

  const numero = intentosPrevios.reduce((mayor, i) => Math.max(mayor, i.numero), 0) + 1;
  const intento: IIntentoEntrega = {
    numero,
    texto_entrega: texto,
    respuesta_html: respuestaHtml,
    archivos: datosArchivos,
    archivo_path: datosArchivos[0]?.path ?? null,
    archivo_nombre: datosArchivos[0]?.nombre ?? null,
    archivo_formato: datosArchivos[0]?.formato ?? null,
    archivo_bytes: datosArchivos[0]?.bytes ?? null,
    fecha_entrega: ahora,
    con_retraso: ventana.tardia,
    acceso_especial: ventana.acceso_especial,
  };

  let entrega;
  try {
    entrega = await ActivitySubmission.findOneAndUpdate(
      // `calificacion_numerica: null` cierra la carrera con una calificación que llegue entre la lectura y esta escritura, y
      // `intentos.numero` $ne cierra la de dos entregas al mismo tiempo (doble clic): la segunda no coincide, intenta insertar
      // y el índice único la convierte en un 409 en vez de pisar la nota o duplicar el intento.
      { activity_id: actividad._id, student_id: estudiante._id, calificacion_numerica: null, 'intentos.numero': { $ne: numero } },
      {
        $set: {
          // Los campos de arriba reflejan el intento que cuenta; mientras el docente no elija uno, el último. Elegir otra vez
          // es necesario cuando llega un intento nuevo, porque lo que había elegido ya no es todo lo que entregó.
          texto_entrega: intento.texto_entrega,
          archivo_path: intento.archivo_path,
          archivo_nombre: intento.archivo_nombre,
          archivo_formato: intento.archivo_formato,
          archivo_bytes: intento.archivo_bytes,
          fecha_entrega: ahora,
          estado: ventana.tardia ? 'ENTREGADA_TARDE' : 'ENTREGADA',
          con_retraso: ventana.tardia,
          intento_valido: null,
          intentos: [...intentosPrevios, intento],
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (err) {
    await Promise.all(destinos.map((d) => fs.rm(d, { force: true })));
    if ((err as { code?: number }).code === 11000) {
      const actual = await ActivitySubmission.findOne({ activity_id: actividad._id, student_id: estudiante._id }).select('calificacion_numerica').lean();
      throw new ApiError(
        409,
        typeof actual?.calificacion_numerica === 'number'
          ? 'La actividad ya fue calificada; no se puede modificar la entrega.'
          : 'Tu entrega ya se registró. Actualiza la página para verla.'
      );
    }
    throw err;
  }

  await registrarEvento({
    usuario_id: estudiante._id,
    accion: 'ACTIVIDAD_ENTREGA_REGISTRADA',
    entidad: 'ActivitySubmission',
    entidad_id: entrega?._id ?? null,
    detalle: `Actividad ${String(actividad._id)}, entrega ${numero}${ventana.tardia ? ' (con retraso)' : ''}${ventana.acceso_especial ? ' (acceso especial)' : ''}.`,
    ip,
  });
  await avisarEntregaNueva(actividad, asignacion);
  return vistaEntrega(entrega as unknown as EntregaPlana);
}

// --- Revisión del docente ---

/** Cada estudiante activo del grupo con lo que entregó (o nada): la lista desde la que el docente revisa y califica. */
export async function listarEntregas(activityId: string, usuario: UserDocument) {
  const actividad = await Activity.findById(activityId).lean();
  if (!actividad) throw new ApiError(404, 'Actividad no encontrada.');
  if (usuario.rol === ROLES.DOCENTE) await asignacionDelDocente(actividad.teacher_assignment_id, usuario);

  const asignacion = await TeacherAssignment.findById(actividad.teacher_assignment_id).select('group_id').lean();
  if (!asignacion?.group_id) throw new ApiError(404, 'Grupo de la actividad no encontrado.');

  const [matriculas, entregas] = await Promise.all([
    Enrollment.find({ group_id: asignacion.group_id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } })
      .populate<{ student_id: { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string } | null }>(
        'student_id',
        'nombre apellido numero_documento'
      )
      .lean(),
    ActivitySubmission.find({ activity_id: actividad._id }).lean(),
  ]);
  const entregaDe = new Map(entregas.map((e) => [String(e.student_id), e as unknown as EntregaPlana]));

  return matriculas
    .filter((m) => m.student_id)
    .map((m) => {
      const estudiante = m.student_id as { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string };
      const entrega = entregaDe.get(String(estudiante._id)) ?? null;
      const acceso = accesoEspecialDe(actividad as unknown as ActividadPlana, estudiante._id);
      return {
        estudiante: {
          _id: String(estudiante._id),
          nombre: estudiante.nombre,
          apellido: estudiante.apellido,
          numero_documento: estudiante.numero_documento,
        },
        estado: estadoDeEntrega(entrega),
        entrega: vistaEntrega(entrega),
        acceso_especial: acceso ? { fecha_limite: acceso.fecha_limite, motivo: acceso.motivo, fecha: acceso.fecha } : null,
      };
    })
    .sort((a, b) => `${a.estudiante.apellido} ${a.estudiante.nombre}`.localeCompare(`${b.estudiante.apellido} ${b.estudiante.nombre}`, 'es'));
}

/**
 * El docente titular escoge cuál de los intentos del estudiante es el válido para calificar. Mientras no lo haga, quien entregó
 * más de una vez no se puede calificar. Se puede cambiar de opinión mientras la planilla siga abierta.
 */
export async function elegirIntentoValido(activityId: string, estudianteId: string, numero: number, docente: UserDocument, ip?: string | null) {
  const { actividad, asignacion, esTitular } = await exigirAccesoALaActividad(activityId, docente);
  if (!esTitular) throw new ApiError(403, 'Solo el docente titular elige la entrega válida.');
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  await assertPeriodNotLocked(asignacion.academic_year_id, asignacion.group_id as Types.ObjectId, actividad.periodo_numero, docente._id);
  await exigirPlanillaAbierta(asignacion._id, actividad.periodo_numero, 'elegir la entrega válida');

  const entrega = await ActivitySubmission.findOne({ activity_id: actividad._id, student_id: estudianteId });
  if (!entrega) throw new ApiError(404, 'El estudiante no ha entregado esta actividad.');
  const intento = intentosDe(entrega.toObject() as unknown as EntregaPlana).find((i) => i.numero === numero);
  if (!intento) throw new ApiError(404, `El estudiante no tiene una entrega número ${numero}.`);

  // Si era una entrega anterior a los intentos, se vuelve explícita para poder marcarla.
  if (!entrega.intentos || entrega.intentos.length === 0) entrega.set('intentos', [intento]);
  entrega.intento_valido = numero;
  entrega.texto_entrega = intento.texto_entrega;
  entrega.archivo_path = intento.archivo_path;
  entrega.archivo_nombre = intento.archivo_nombre;
  entrega.archivo_formato = intento.archivo_formato;
  entrega.archivo_bytes = intento.archivo_bytes;
  entrega.fecha_entrega = intento.fecha_entrega;
  entrega.con_retraso = intento.con_retraso;
  if (typeof entrega.calificacion_numerica !== 'number') entrega.estado = intento.con_retraso ? 'ENTREGADA_TARDE' : 'ENTREGADA';
  await entrega.save();

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'ACTIVIDAD_ENTREGA_VALIDA_ELEGIDA',
    entidad: 'ActivitySubmission',
    entidad_id: entrega._id,
    detalle: `Actividad ${String(actividad._id)}: entrega ${numero} como válida.`,
    ip,
  });
  return vistaEntrega(entrega.toObject() as unknown as EntregaPlana);
}

/**
 * Archivo entregado: el propio estudiante, el docente titular, coordinación o administración. Sin `intento` es el que cuenta;
 * con él, cualquiera de los intentos (el docente compara antes de elegir). `archivo` es la posición entre los archivos del intento.
 */
export async function rutaDeEntrega(entregaId: string, usuario: UserDocument, intento?: number, archivo = 0): Promise<{ ruta: string; nombre: string | null }> {
  const entrega = (await ActivitySubmission.findById(entregaId).lean()) as unknown as EntregaPlana | null;
  if (!entrega) throw new ApiError(404, 'Entrega no encontrada.');

  if (usuario.rol === ROLES.ESTUDIANTE) {
    if (String(entrega.student_id) !== String(usuario._id)) throw new ApiError(404, 'Entrega no encontrada.');
  } else if (usuario.rol === ROLES.DOCENTE) {
    const actividad = await Activity.findById(entrega.activity_id).select('teacher_assignment_id').lean();
    if (!actividad) throw new ApiError(404, 'Entrega no encontrada.');
    await asignacionDelDocente(actividad.teacher_assignment_id, usuario);
  }

  const intentos = intentosDe(entrega);
  const elegido = intento != null ? intentos.find((i) => i.numero === intento) : intentoConsiderado(intentos, entrega.intento_valido);
  const elegidoArchivo = elegido ? archivosDe(elegido)[archivo] : undefined;
  if (!elegidoArchivo) throw new ApiError(404, 'Entrega no encontrada.');
  return { ruta: path.resolve(process.cwd(), elegidoArchivo.path), nombre: elegidoArchivo.nombre };
}
