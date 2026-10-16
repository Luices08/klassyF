import { Types } from 'mongoose';
import { FormatoEvidencia, ProveedorVideo, TipoActividad, TipoAdjunto } from '../constants/actividades';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import Activity, { ActivityDocument, IActivity, IAdjuntoActividad, IVideoActividad } from '../models/activity.model';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import ActivitySubmission from '../models/activitySubmission.model';
import Enrollment from '../models/enrollment.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { AlertaCalendario, estadoDeEntrega, evaluarVentanaEntrega } from '../utils/actividades';
import { camposModificados } from '../utils/entregasActividad';
import { sanitizarContenido, textoPlano, urlIncrustada } from '../utils/contenidoActividad';
import { finDelDia, inicioDelDia } from '../utils/calendarioAcademico';
import { componentesEfectivos } from '../utils/siee';
import { ContextoAsignacion, contextosDeAsignaciones } from './actividadContexto.service';
import { ReferenciaAdjunto, liberarAdjuntosSinUso, resolverAdjuntos, resolverVideos } from './actividadAdjuntos.service';
import { cargaMensualDelGrupo, exigirAlertasResueltas, revisarCalendario } from './actividadCalendario.service';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { registrarEvento } from './audit.service';
import { fechaDeClase } from './attendance.service';
import { casillasDeClase, exigirCasillaDisponible, exigirPesosValidos } from './casillasBloque.service';
import { exigirPlanillaAbierta } from './notasEstado.service';
import { avisarActividadNueva } from './notificacionesEventos.service';
import { exigirPlanAulaAprobado } from './planeacionCompuertas.service';

export type ActividadPlana = IActivity & { _id: Types.ObjectId };

export interface VistaActividad {
  _id: string;
  teacher_assignment_id: string;
  periodo_numero: number;
  titulo: string;
  descripcion: string;
  tipo: TipoActividad;
  componente_siee: string;
  /** Nombre del bloque del molde en el año de la actividad (M12); la clave si ese bloque ya no existe. */
  componente_nombre: string;
  /** % que pesa dentro de su bloque; null = automático. */
  peso_en_componente: number | null;
  fecha_apertura: Date;
  fecha_entrega: Date;
  requiere_entrega: boolean;
  formatos_permitidos: FormatoEvidencia[];
  permite_entrega_tardia: boolean;
  permite_multiples_entregas: boolean;
  cerrada: boolean;
  /** El texto del editor (ya limpiado). Solo viaja en el detalle: los listados no cargan imágenes. */
  contenido_html?: string;
  adjuntos: Array<{ id: string; ext: string; nombre: string; tipo: TipoAdjunto; bytes: number }>;
  videos: Array<{ proveedor: ProveedorVideo; video_id: string; url_incrustada: string }>;
  /** Si se publicó en varios grupos a la vez, lo que las une. */
  publicacion_id: string | null;
  /** Qué cambió el docente después de publicarla (solo los nombres de los campos). */
  modificaciones: Array<{ fecha: Date; campos: string[] }>;
  publicada: boolean;
  vencida: boolean;
  asignacion: ContextoAsignacion | null;
}

/**
 * La actividad tal como viaja por la API. Las anteriores a M11 no guardan los campos nuevos: se leen con los valores
 * que ya tenían en la práctica (tarea con entrega, sin entrega tardía).
 */
export async function armarVistas(actividades: ActividadPlana[], ahora = new Date(), conContenido = false): Promise<VistaActividad[]> {
  if (actividades.length === 0) return [];

  const contextos = await contextosDeAsignaciones([...new Set(actividades.map((a) => String(a.teacher_assignment_id)))]);

  const aniosIds = [...new Set([...contextos.values()].map((c) => c.academic_year_id))];
  const anios = await AcademicYear.find({ _id: { $in: aniosIds } }).select('componentes_evaluativos ponderacion_componentes');
  const nombreDeComponente = new Map(
    anios.map((anio) => [String(anio._id), new Map(componentesEfectivos(anio).map((c) => [c.clave, c.nombre]))])
  );

  return actividades.map((a) => {
    const anioId = contextos.get(String(a.teacher_assignment_id))?.academic_year_id ?? '';
    const ventana = evaluarVentanaEntrega(
      { fecha_apertura: a.fecha_apertura, fecha_entrega: a.fecha_entrega, permite_entrega_tardia: a.permite_entrega_tardia ?? false },
      ahora
    );
    return {
      _id: String(a._id),
      teacher_assignment_id: String(a.teacher_assignment_id),
      periodo_numero: a.periodo_numero,
      titulo: a.titulo,
      descripcion: a.descripcion,
      tipo: a.tipo ?? 'TAREA',
      componente_siee: a.componente_siee,
      componente_nombre: nombreDeComponente.get(anioId)?.get(a.componente_siee) ?? a.componente_siee,
      peso_en_componente: a.peso_en_componente,
      fecha_apertura: a.fecha_apertura,
      fecha_entrega: a.fecha_entrega,
      requiere_entrega: a.requiere_entrega ?? true,
      formatos_permitidos: a.formatos_permitidos ?? [],
      permite_entrega_tardia: a.permite_entrega_tardia ?? false,
      permite_multiples_entregas: a.permite_multiples_entregas ?? false,
      cerrada: a.cerrada ?? false,
      ...(conContenido ? { contenido_html: a.contenido_html ?? '' } : {}),
      adjuntos: (a.adjuntos ?? []).map(({ id, ext, nombre, tipo, bytes }) => ({ id, ext, nombre, tipo, bytes })),
      videos: (a.videos ?? []).map((v: IVideoActividad) => ({ proveedor: v.proveedor, video_id: v.video_id, url_incrustada: urlIncrustada(v) })),
      publicacion_id: a.publicacion_id ? String(a.publicacion_id) : null,
      modificaciones: (a.modificaciones ?? []).map((m) => ({ fecha: m.fecha, campos: camposModificados(m.campos) })),
      publicada: ventana.publicada,
      vencida: ventana.vencida,
      asignacion: contextos.get(String(a.teacher_assignment_id)) ?? null,
    };
  });
}

// --- Contexto del docente (M08) ---

/** Filtro de identidad: un docente solo programa actividades de las clases que tiene asignadas (M08). */
export async function asignacionDelDocente(id: string | Types.ObjectId, docente: UserDocument): Promise<TeacherAssignmentDocument> {
  const asignacion = await TeacherAssignment.findById(id);
  if (!asignacion) throw new ApiError(404, 'Asignacion academica (TeacherAssignment) no encontrada.');
  if (String(asignacion.docente_id) !== String(docente._id)) {
    throw new ApiError(403, 'Solo el docente titular de esta asignacion puede gestionar actividades sobre ella.');
  }
  if (asignacion.tipo_asignacion !== 'CLASE' || !asignacion.group_id || !asignacion.subject_id) {
    throw new ApiError(400, 'Las actividades solo se programan sobre asignaciones de tipo CLASE (un grupo y una asignatura).');
  }
  if (asignacion.estado === 'inactivo') throw new ApiError(400, 'Esta asignación académica ya no está activa.');
  return asignacion;
}

export function exigirPeriodoAbierto(anio: AcademicYearDocument, periodo: number): void {
  const encontrado = anio.periodos.find((p) => p.numero === periodo);
  if (!encontrado) throw new ApiError(400, `El año lectivo ${anio.year} no tiene periodo ${periodo}.`);
  if (encontrado.estado === 'CERRADO') {
    throw new ApiError(409, `El periodo ${periodo} está CERRADO: ya no se programan ni se modifican actividades.`);
  }
}

/** El bloque debe existir en el molde de la planilla del año (M12). */
function validarComponente(anio: AcademicYearDocument, clave: string): void {
  if (!componentesEfectivos(anio).some((c) => c.clave === clave)) {
    throw new ApiError(400, `El bloque «${clave}» no existe en el molde de la planilla de este año.`);
  }
}

/**
 * La actividad ocupa una casilla de su bloque: debe haber lugar (el molde fija el máximo) y los pesos puestos en el bloque no
 * pueden pasar de 100%. `excluirId` es la propia actividad cuando se edita; `cambiaDeBloque` evita exigir lugar si no se mueve.
 */
async function validarCasilla(
  anio: AcademicYearDocument,
  asignacion: TeacherAssignmentDocument,
  periodo: number,
  bloque: string,
  peso: number | null,
  excluirId?: Types.ObjectId,
  cambiaDeBloque = true
): Promise<void> {
  if (cambiaDeBloque) await exigirCasillaDisponible(asignacion, periodo, bloque, excluirId);
  const existentes = (await casillasDeClase(asignacion._id, periodo)).filter((c) => c.id !== String(excluirId ?? ''));
  const nombres = new Map(componentesEfectivos(anio).map((c) => [c.clave, c.nombre]));
  exigirPesosValidos([...existentes, { id: 'nueva', bloque, peso }], (clave) => nombres.get(clave) ?? clave);
}

// --- Gestión (CU-DOC-02) ---

export interface CreateActivityInput {
  teacher_assignment_id: string;
  periodo_numero: number;
  titulo: string;
  /** Texto sin formato; es opcional si llega `contenido_html`, de donde se deriva. */
  descripcion?: string;
  /** Lo que escribió el docente en el editor (se limpia en el servidor). */
  contenido_html?: string;
  tipo: TipoActividad;
  componente_siee: string;
  /** % del bloque; sin él la actividad se reparte en partes iguales con las demás casillas sin peso. */
  peso_en_componente?: number | null;
  fecha_apertura: string | Date;
  fecha_entrega: string | Date;
  requiere_entrega?: boolean;
  formatos_permitidos?: FormatoEvidencia[];
  permite_entrega_tardia?: boolean;
  permite_multiples_entregas?: boolean;
  adjuntos?: ReferenciaAdjunto[];
  /** Enlaces de YouTube o Vimeo. */
  videos?: string[];
  /** Otras clases del mismo docente, de la misma asignatura (otros grupos), donde se publica lo mismo. */
  grupos_adicionales?: string[];
  confirmar_alertas?: boolean;
}

/** El texto del editor y su versión sin formato; el docente puede escribir solo texto plano (descripcion) o usar el editor. */
function resolverContenido(entrada: { descripcion?: string; contenido_html?: string }): { descripcion: string; contenido_html: string } {
  const html = entrada.contenido_html ? sanitizarContenido(entrada.contenido_html) : '';
  const texto = html ? textoPlano(html) : (entrada.descripcion ?? '').trim();
  if (!html && !texto) throw new ApiError(400, 'Escribe la descripción o las instrucciones de la actividad.');
  // Una descripción solo con imágenes no tiene texto: los listados necesitan algo que mostrar.
  return { descripcion: (texto || 'Ver el contenido de la actividad.').slice(0, 5000), contenido_html: html };
}

interface ValidacionDeCreacion {
  asignacion: TeacherAssignmentDocument;
  alertas: AlertaCalendario[];
}

/** Todo lo que el servidor exige para programar una actividad en una clase, menos confirmar las advertencias del calendario. */
async function validarCreacion(input: CreateActivityInput, asignacion: TeacherAssignmentDocument): Promise<ValidacionDeCreacion> {
  // Un año CERRADO es historico de solo lectura, igual que en el resto de modulos.
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  const anio = await AcademicYear.findById(asignacion.academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo de la asignación académica no encontrado.');
  exigirPeriodoAbierto(anio, input.periodo_numero);
  validarComponente(anio, input.componente_siee);
  await exigirPlanillaAbierta(asignacion._id, input.periodo_numero, 'programar nuevas actividades');
  await validarCasilla(anio, asignacion, input.periodo_numero, input.componente_siee, input.peso_en_componente ?? null);
  // M07: sin plan de aula aprobado de ese periodo no se programa nada.
  await exigirPlanAulaAprobado(asignacion, input.periodo_numero);

  const revision = await revisarCalendario(asignacion, {
    periodo_numero: input.periodo_numero,
    fecha_entrega: new Date(input.fecha_entrega),
    tipo: input.tipo,
    exigir_futuro: input.requiere_entrega ?? true,
  });
  return { asignacion, alertas: revision.alertas };
}

export interface CopiaOmitida {
  teacher_assignment_id: string;
  grupo: string;
  motivo: string;
}

export interface ResultadoCreacion {
  /** La de la clase desde la que se programó. */
  actividad: ActivityDocument;
  /** Las demás, una por cada grupo adicional donde sí se pudo publicar. */
  copias: ActivityDocument[];
  /** Grupos donde no se publicó y por qué (p. ej. falta el plan de aula aprobado de su grado). */
  omitidas: CopiaOmitida[];
}

async function nombreDeGrupo(asignacion: TeacherAssignmentDocument): Promise<string> {
  const contexto = (await contextosDeAsignaciones([asignacion._id])).get(String(asignacion._id));
  return contexto?.grupo ? `${contexto.grado?.nombre ?? ''} ${contexto.grupo.nomenclatura}`.trim() : 'otro grupo';
}

/**
 * Programa la actividad en la clase elegida y, si se pidió, en las demás clases del docente donde dicta la misma asignatura (otros
 * grupos). La clase principal debe cumplir todo; en cada grupo adicional lo que no cumple lo deja fuera con su motivo y no frena el
 * resto. Las advertencias del calendario de cualquier grupo se confirman una sola vez.
 */
export async function publicarActividad(input: CreateActivityInput, docente: UserDocument, ip?: string | null): Promise<ResultadoCreacion> {
  const principal = await asignacionDelDocente(input.teacher_assignment_id, docente);
  const contenido = resolverContenido(input);
  const adjuntos = await resolverAdjuntos(input.adjuntos ?? []);
  const videos = resolverVideos(input.videos ?? []);
  const requiereEntrega = input.requiere_entrega ?? true;

  const adicionalesIds = [...new Set(input.grupos_adicionales ?? [])].filter((id) => id !== input.teacher_assignment_id);
  const adicionales: TeacherAssignmentDocument[] = [];
  for (const id of adicionalesIds) {
    const asignacion = await asignacionDelDocente(id, docente);
    if (String(asignacion.subject_id) !== String(principal.subject_id) || String(asignacion.academic_year_id) !== String(principal.academic_year_id)) {
      throw new ApiError(400, 'Solo se puede publicar en otros grupos donde dictas la misma asignatura, en el mismo año lectivo.');
    }
    adicionales.push(asignacion);
  }

  const validacionPrincipal = await validarCreacion(input, principal);
  const alertas = [...validacionPrincipal.alertas];
  const destinos: TeacherAssignmentDocument[] = [principal];
  const omitidas: CopiaOmitida[] = [];

  for (const asignacion of adicionales) {
    const grupo = await nombreDeGrupo(asignacion);
    try {
      const validacion = await validarCreacion(input, asignacion);
      const bloqueo = validacion.alertas.find((a) => a.severidad === 'BLOQUEO');
      if (bloqueo) {
        omitidas.push({ teacher_assignment_id: String(asignacion._id), grupo, motivo: bloqueo.mensaje });
        continue;
      }
      // Las advertencias de otros grupos se muestran con su nombre para que el docente sepa de cuál hablan.
      alertas.push(...validacion.alertas.map((a) => ({ ...a, mensaje: `(${grupo}) ${a.mensaje}` })));
      destinos.push(asignacion);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      omitidas.push({ teacher_assignment_id: String(asignacion._id), grupo, motivo: err.message });
    }
  }
  exigirAlertasResueltas(alertas, input.confirmar_alertas ?? false);

  const publicacionId = destinos.length > 1 ? new Types.ObjectId() : null;
  const creadas: ActivityDocument[] = [];
  for (const asignacion of destinos) {
    creadas.push(
      await Activity.create({
        teacher_assignment_id: asignacion._id,
        periodo_numero: input.periodo_numero,
        titulo: input.titulo,
        descripcion: contenido.descripcion,
        contenido_html: contenido.contenido_html,
        tipo: input.tipo,
        componente_siee: input.componente_siee,
        peso_en_componente: input.peso_en_componente ?? null,
        fecha_apertura: input.fecha_apertura,
        fecha_entrega: new Date(input.fecha_entrega),
        requiere_entrega: requiereEntrega,
        formatos_permitidos: requiereEntrega ? (input.formatos_permitidos ?? []) : [],
        permite_entrega_tardia: input.permite_entrega_tardia ?? false,
        permite_multiples_entregas: requiereEntrega ? (input.permite_multiples_entregas ?? false) : false,
        adjuntos,
        videos,
        publicacion_id: publicacionId,
      })
    );
  }

  for (const [indice, actividad] of creadas.entries()) {
    await registrarEvento({
      usuario_id: docente._id,
      accion: 'ACTIVIDAD_CREADA',
      entidad: 'Activity',
      entidad_id: actividad._id,
      detalle: `${input.tipo} «${input.titulo}», periodo ${input.periodo_numero}${creadas.length > 1 ? ` (publicada en ${creadas.length} grupos)` : ''}.`,
      ip,
    });
    if (actividad.fecha_apertura.getTime() <= Date.now()) await avisarActividadNueva(destinos[indice] as TeacherAssignmentDocument);
  }
  return { actividad: creadas[0] as ActivityDocument, copias: creadas.slice(1), omitidas };
}

/** Programa la actividad en una sola clase (sin grupos adicionales) y devuelve el documento. */
export async function createActivity(input: CreateActivityInput, docente: UserDocument, ip?: string | null): Promise<ActivityDocument> {
  return (await publicarActividad({ ...input, grupos_adicionales: [] }, docente, ip)).actividad;
}

export interface UpdateActivityInput {
  titulo?: string;
  descripcion?: string;
  contenido_html?: string;
  tipo?: TipoActividad;
  componente_siee?: string;
  peso_en_componente?: number | null;
  fecha_apertura?: string | Date;
  fecha_entrega?: string | Date;
  requiere_entrega?: boolean;
  formatos_permitidos?: FormatoEvidencia[];
  permite_entrega_tardia?: boolean;
  permite_multiples_entregas?: boolean;
  adjuntos?: ReferenciaAdjunto[];
  videos?: string[];
  /** true = cerrarla a mano (ya no recibe entregas); false = reabrirla. */
  cerrada?: boolean;
  confirmar_alertas?: boolean;
}

const mismaFecha = (a: Date, b: string | Date): boolean => a.getTime() === new Date(b).getTime();

/**
 * El periodo y la asignación no se cambian (una actividad de otro periodo exige otro plan de aula aprobado: se elimina
 * y se programa de nuevo). Lo que ya tiene notas no cambia de componente ni de peso: eso es de M12. Ya publicada y con entregas,
 * tampoco cambian los formatos admitidos ni se quitan las entregas múltiples a quien ya las usó, y lo que el docente modifica
 * queda anotado para que el estudiante lo vea.
 */
export async function updateActivity(
  id: string,
  cambios: UpdateActivityInput,
  docente: UserDocument,
  ip?: string | null
): Promise<ActivityDocument> {
  const actividad = await Activity.findById(id);
  if (!actividad) throw new ApiError(404, 'Actividad no encontrada.');
  const asignacion = await asignacionDelDocente(actividad.teacher_assignment_id, docente);
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  const anio = await AcademicYear.findById(asignacion.academic_year_id);
  if (!anio) throw new ApiError(404, 'Año lectivo de la asignación académica no encontrado.');
  exigirPeriodoAbierto(anio, actividad.periodo_numero);

  const entregas = await ActivitySubmission.find({ activity_id: actividad._id }).select('calificacion_numerica fecha_entrega intentos').lean();
  const hayEntregas = entregas.some((e) => e.fecha_entrega);

  // El bloque y el peso de la casilla los decide el docente en su planilla mientras esté abierta; cerrada, no se mueve nada.
  const bloqueNuevo = cambios.componente_siee ?? actividad.componente_siee;
  const pesoNuevo = cambios.peso_en_componente !== undefined ? cambios.peso_en_componente : (actividad.peso_en_componente ?? null);
  const cambiaDeBloque = bloqueNuevo !== actividad.componente_siee;
  if (cambiaDeBloque) validarComponente(anio, bloqueNuevo);
  if (cambiaDeBloque || pesoNuevo !== (actividad.peso_en_componente ?? null)) {
    await exigirPlanillaAbierta(asignacion._id, actividad.periodo_numero, 'cambiar el bloque o el peso de una actividad');
    await validarCasilla(anio, asignacion, actividad.periodo_numero, bloqueNuevo, pesoNuevo, actividad._id, cambiaDeBloque);
  }
  if (cambios.requiere_entrega === false && (actividad.requiere_entrega ?? true) && hayEntregas) {
    throw new ApiError(409, 'Ya hay estudiantes que entregaron: la actividad no puede pasar a no recibir entregas.');
  }
  if (cambios.formatos_permitidos !== undefined && hayEntregas) {
    const actuales = [...(actividad.formatos_permitidos ?? [])].sort().join(',');
    if (actuales !== [...cambios.formatos_permitidos].sort().join(',')) {
      throw new ApiError(409, 'Ya hay estudiantes que entregaron: los formatos de entrega no se pueden cambiar.');
    }
  }
  if (cambios.permite_multiples_entregas === false && (actividad.permite_multiples_entregas ?? false) && entregas.some((e) => (e.intentos?.length ?? 0) > 1)) {
    throw new ApiError(409, 'Hay estudiantes con más de una entrega: la actividad no puede volver a una sola entrega.');
  }
  // La fecha de apertura es la publicación: moverla también exige el plan de aula aprobado. Corregir un título no.
  if (cambios.fecha_apertura !== undefined && !mismaFecha(actividad.fecha_apertura, cambios.fecha_apertura)) {
    await exigirPlanAulaAprobado(asignacion, actividad.periodo_numero);
  }

  const fechaCambia = cambios.fecha_entrega !== undefined && !mismaFecha(actividad.fecha_entrega, cambios.fecha_entrega);
  const tipoCambia = cambios.tipo !== undefined && cambios.tipo !== (actividad.tipo ?? 'TAREA');
  const requiereEntrega = cambios.requiere_entrega ?? actividad.requiere_entrega ?? true;
  if (fechaCambia || tipoCambia) {
    const revision = await revisarCalendario(asignacion, {
      periodo_numero: actividad.periodo_numero,
      fecha_entrega: new Date(cambios.fecha_entrega ?? actividad.fecha_entrega),
      tipo: cambios.tipo ?? actividad.tipo ?? 'TAREA',
      excluir_id: actividad._id,
      exigir_futuro: fechaCambia && requiereEntrega,
    });
    exigirAlertasResueltas(revision.alertas, cambios.confirmar_alertas ?? false);
  }

  const { confirmar_alertas: _confirmar, descripcion, contenido_html, adjuntos, videos, cerrada, ...resto } = cambios;
  const yaPublicada = actividad.fecha_apertura.getTime() <= Date.now();
  const estabaOculta = !yaPublicada;
  const camposCambiados: string[] = [];

  for (const [campo, valor] of Object.entries(resto)) {
    const actual = (actividad as unknown as Record<string, unknown>)[campo];
    const igual =
      actual instanceof Date ? mismaFecha(actual, valor as string | Date) : JSON.stringify(actual ?? null) === JSON.stringify(valor ?? null);
    if (!igual && ['titulo', 'tipo', 'fecha_apertura', 'fecha_entrega', 'requiere_entrega', 'formatos_permitidos', 'permite_entrega_tardia', 'permite_multiples_entregas'].includes(campo)) {
      camposCambiados.push(campo);
    }
  }
  actividad.set(resto);

  if (descripcion !== undefined || contenido_html !== undefined) {
    const nuevo = resolverContenido({
      descripcion: descripcion ?? (contenido_html === undefined ? undefined : actividad.descripcion),
      contenido_html: contenido_html ?? (descripcion !== undefined ? '' : actividad.contenido_html),
    });
    if (nuevo.descripcion !== actividad.descripcion || nuevo.contenido_html !== (actividad.contenido_html ?? '')) camposCambiados.push('contenido_html');
    actividad.descripcion = nuevo.descripcion;
    actividad.contenido_html = nuevo.contenido_html;
  }

  let adjuntosQuitados: IAdjuntoActividad[] = [];
  if (adjuntos !== undefined) {
    const nuevos = await resolverAdjuntos(adjuntos);
    const idsNuevos = new Set(nuevos.map((a) => a.id));
    adjuntosQuitados = (actividad.adjuntos ?? []).filter((a) => !idsNuevos.has(a.id));
    if (JSON.stringify(nuevos.map((a) => a.id)) !== JSON.stringify((actividad.adjuntos ?? []).map((a) => a.id))) camposCambiados.push('adjuntos');
    actividad.set('adjuntos', nuevos);
  }
  if (videos !== undefined) {
    const nuevos = resolverVideos(videos);
    if (JSON.stringify(nuevos) !== JSON.stringify((actividad.videos ?? []).map(({ proveedor, video_id }) => ({ proveedor, video_id })))) camposCambiados.push('videos');
    actividad.set('videos', nuevos);
  }
  if (cerrada !== undefined && cerrada !== (actividad.cerrada ?? false)) {
    actividad.cerrada = cerrada;
    actividad.cerrada_en = cerrada ? new Date() : null;
  }
  if (!requiereEntrega) {
    actividad.formatos_permitidos = [];
    actividad.permite_multiples_entregas = false;
  }
  // Lo que el estudiante ya pudo ver y cambia por debajo de él queda anotado.
  if (yaPublicada && camposCambiados.length > 0) actividad.modificaciones.push({ fecha: new Date(), por: docente._id, campos: camposCambiados });
  await actividad.save();
  if (adjuntosQuitados.length > 0) await liberarAdjuntosSinUso(adjuntosQuitados);

  await registrarEvento({
    usuario_id: docente._id,
    accion: cerrada !== undefined && Object.keys(resto).length === 0 && descripcion === undefined ? (cerrada ? 'ACTIVIDAD_CERRADA' : 'ACTIVIDAD_REABIERTA') : 'ACTIVIDAD_ACTUALIZADA',
    entidad: 'Activity',
    entidad_id: actividad._id,
    detalle: [...Object.keys(resto), ...(descripcion !== undefined || contenido_html !== undefined ? ['descripcion'] : []), ...(cerrada !== undefined ? ['cerrada'] : [])].join(', '),
    ip,
  });
  if (estabaOculta && actividad.fecha_apertura.getTime() <= Date.now()) await avisarActividadNueva(asignacion);
  return actividad;
}

/** Solo se elimina lo que ningún estudiante ha tocado; con entregas o notas queda como registro del periodo. */
export async function deleteActivity(id: string, docente: UserDocument, ip?: string | null): Promise<void> {
  const actividad = await Activity.findById(id);
  if (!actividad) throw new ApiError(404, 'Actividad no encontrada.');
  const asignacion = await asignacionDelDocente(actividad.teacher_assignment_id, docente);
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));

  if (await ActivitySubmission.exists({ activity_id: actividad._id })) {
    throw new ApiError(409, 'La actividad ya tiene entregas o notas de estudiantes: no se puede eliminar.');
  }
  await actividad.deleteOne();
  await liberarAdjuntosSinUso(actividad.adjuntos ?? []);

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'ACTIVIDAD_ELIMINADA',
    entidad: 'Activity',
    entidad_id: actividad._id,
    detalle: `«${actividad.titulo}», periodo ${actividad.periodo_numero}.`,
    ip,
  });
}

export interface RevisionCalendarioQuery {
  teacher_assignment_id: string;
  periodo_numero: number;
  fecha_entrega: Date;
  tipo: TipoActividad;
  excluir_id?: string;
  exigir_futuro?: boolean;
}

/** Alerta temprana mientras el docente elige la fecha: la misma revisión que repetirá el servidor al guardar. */
export async function revisionDeCalendario(query: RevisionCalendarioQuery, docente: UserDocument) {
  const asignacion = await asignacionDelDocente(query.teacher_assignment_id, docente);
  return revisarCalendario(asignacion, {
    periodo_numero: query.periodo_numero,
    fecha_entrega: query.fecha_entrega,
    tipo: query.tipo,
    excluir_id: query.excluir_id,
    exigir_futuro: query.exigir_futuro ?? true,
  });
}

export interface CargaDelGrupoQuery {
  teacher_assignment_id: string;
  /** AAAA-MM. */
  mes: string;
  excluir_id?: string;
}

/** Mapa de calor del grupo para elegir la fecha de entrega: qué tiene ya cada día, de cualquier docente. */
export async function cargaDelGrupo(query: CargaDelGrupoQuery, docente: UserDocument) {
  const asignacion = await asignacionDelDocente(query.teacher_assignment_id, docente);
  return cargaMensualDelGrupo(asignacion, query.mes, query.excluir_id);
}

// --- Consulta ---

export interface ListActivitiesQuery {
  academic_year_id?: string;
  teacher_assignment_id?: string;
  group_id?: string;
  periodo?: number;
  tipo?: TipoActividad;
  /** YYYY-MM-DD, sobre la fecha de entrega. */
  desde?: string;
  hasta?: string;
}

export interface ResumenEntregas {
  estudiantes: number;
  entregadas: number;
  con_retraso: number;
  calificadas: number;
}

async function anioEnCursoId(): Promise<string | null> {
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' }).select('_id');
  return anio ? String(anio._id) : null;
}

async function resumenesDeEntrega(actividades: ActividadPlana[]): Promise<Map<string, ResumenEntregas>> {
  const asignaciones = await TeacherAssignment.find({ _id: { $in: actividades.map((a) => a.teacher_assignment_id) } })
    .select('group_id')
    .lean();
  const grupoDe = new Map(asignaciones.map((a) => [String(a._id), a.group_id ? String(a.group_id) : null]));
  const grupos = [...new Set([...grupoDe.values()].filter((g): g is string => g !== null))];

  const [matriculas, entregas] = await Promise.all([
    Enrollment.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { group_id: { $in: grupos.map((g) => new Types.ObjectId(g)) }, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } } },
      { $group: { _id: '$group_id', n: { $sum: 1 } } },
    ]),
    ActivitySubmission.find({ activity_id: { $in: actividades.map((a) => a._id) } })
      .select('activity_id estado calificacion_numerica fecha_entrega con_retraso')
      .lean(),
  ]);
  const estudiantesPorGrupo = new Map(matriculas.map((m) => [String(m._id), m.n]));

  const resumenes = new Map<string, ResumenEntregas>();
  for (const a of actividades) {
    const grupo = grupoDe.get(String(a.teacher_assignment_id));
    resumenes.set(String(a._id), {
      estudiantes: grupo ? (estudiantesPorGrupo.get(grupo) ?? 0) : 0,
      entregadas: 0,
      con_retraso: 0,
      calificadas: 0,
    });
  }
  for (const e of entregas) {
    const resumen = resumenes.get(String(e.activity_id));
    if (!resumen) continue;
    const estado = estadoDeEntrega(e);
    if (estado !== 'PROGRAMADA') resumen.entregadas += 1;
    if (e.con_retraso || estado === 'ENTREGADA_TARDE') resumen.con_retraso += 1;
    if (estado === 'CALIFICADA') resumen.calificadas += 1;
  }
  return resumenes;
}

/**
 * El docente ve las suyas; coordinación y administración, las de cualquier docente (del año vigente si no piden otro).
 * Los estudiantes no entran por aquí: su bandeja es `listarMisActividades`.
 */
export async function listActivities(query: ListActivitiesQuery, usuario: UserDocument) {
  const anioId = query.academic_year_id ?? (await anioEnCursoId());
  if (!anioId) return [];

  const filtroAsignaciones: Record<string, unknown> = { academic_year_id: anioId, tipo_asignacion: 'CLASE' };
  if (usuario.rol === ROLES.DOCENTE) filtroAsignaciones.docente_id = usuario._id;
  if (query.group_id) filtroAsignaciones.group_id = query.group_id;
  if (query.teacher_assignment_id) filtroAsignaciones._id = query.teacher_assignment_id;
  const asignaciones = await TeacherAssignment.find(filtroAsignaciones).select('_id').lean();

  const filtro: Record<string, unknown> = { teacher_assignment_id: { $in: asignaciones.map((a) => a._id) } };
  if (query.periodo) filtro.periodo_numero = query.periodo;
  if (query.tipo) filtro.tipo = query.tipo;
  if (query.desde || query.hasta) {
    filtro.fecha_entrega = {
      ...(query.desde ? { $gte: inicioDelDia(fechaDeClase(query.desde)) } : {}),
      ...(query.hasta ? { $lte: finDelDia(fechaDeClase(query.hasta)) } : {}),
    };
  }

  const actividades = (await Activity.find(filtro).sort({ fecha_entrega: 1 }).lean()) as unknown as ActividadPlana[];
  const [vistas, resumenes] = await Promise.all([armarVistas(actividades), resumenesDeEntrega(actividades)]);
  return vistas.map((v) => ({ ...v, resumen: resumenes.get(v._id) as ResumenEntregas }));
}

/** Detalle para quien gestiona (docente titular, coordinación, administración). */
export async function detalleParaGestion(id: string, usuario: UserDocument) {
  const actividad = (await Activity.findById(id).lean()) as unknown as ActividadPlana | null;
  if (!actividad) throw new ApiError(404, 'Actividad no encontrada.');
  if (usuario.rol === ROLES.DOCENTE) await asignacionDelDocente(actividad.teacher_assignment_id, usuario);

  const hermanas = actividad.publicacion_id
    ? ((await Activity.find({ publicacion_id: actividad.publicacion_id, _id: { $ne: actividad._id } })
        .select('teacher_assignment_id')
        .lean()) as unknown as Array<{ _id: Types.ObjectId; teacher_assignment_id: Types.ObjectId }>)
    : [];
  const [[vista], resumenes, contextosHermanas] = await Promise.all([
    armarVistas([actividad], new Date(), true),
    resumenesDeEntrega([actividad]),
    contextosDeAsignaciones(hermanas.map((h) => h.teacher_assignment_id)),
  ]);
  return {
    ...(vista as VistaActividad),
    resumen: resumenes.get(String(actividad._id)) as ResumenEntregas,
    // Las copias de esta misma actividad en otros grupos: el docente salta de un grupo a otro sin volver a la lista.
    publicada_tambien_en: hermanas.map((h) => {
      const contexto = contextosHermanas.get(String(h.teacher_assignment_id));
      return { _id: String(h._id), grupo: contexto?.grupo ? `${contexto.grado?.nombre ?? ''} ${contexto.grupo.nomenclatura}`.trim() : 'Otro grupo' };
    }),
  };
}
