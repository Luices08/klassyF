import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ESTADOS_NOTA_CERRADOS } from '../constants/notas';
import { PERIODO_DE_RECUPERACION_ANUAL, TipoRecuperacion } from '../constants/recuperaciones';
import { ROLES } from '../constants/roles';
import { AcademicYearDocument } from '../models/academicYear.model';
import CalificacionAsignatura from '../models/calificacionAsignatura.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import NotaHomologada from '../models/notaHomologada.model';
import PromocionAnticipada from '../models/promocionAnticipada.model';
import Recuperacion, { RecuperacionDocument } from '../models/recuperacion.model';
import Subject from '../models/subject.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { escalaEfectiva, validarNotaDentroDeEscala } from '../utils/escalaEvaluacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import {
  contarReprobadas,
  estadoDeRecuperacion,
  evaluarVentana,
  mejorNota,
  necesitaRecuperar,
  notaAnual,
  notaTrasRecuperar,
  PoliticaRecuperacion,
  reglaDePeriodo,
  VentanaRecuperacion,
} from '../utils/recuperaciones';
import { integracionDe, IntegracionPeriodo, integrarRecuperacion, ResultadoIntegracion } from '../utils/integracionRecuperacion';
import { notaEfectivaDePeriodo } from '../utils/notaEfectiva';
import { periodosParaPromediar } from '../utils/promocionAnticipada';
import { asignacionDelDocente } from './activity.service';
import { registrarEvento } from './audit.service';
import { cargarAnio, obtenerPolitica } from './configuracionRecuperaciones.service';
import { avisarRecuperacionRegistrada } from './recuperacionAvisos.service';
import { esGrupoSinReprobacion, idsDeGradosSinReprobacion } from './nivelesSinReprobacion.service';
import { cargarContextoPlanilla, notaDeCasilla } from './notas.service';

// --- Qué nota tiene cada estudiante en cada asignatura (lo cerrado en M12, más lo recuperado en M18) ---

interface NotasDeEstudiante {
  /** Nota cerrada de cada periodo, tal como la dejó la planilla (M12). */
  cerradas: Map<number, number>;
  /** Nota de cada periodo ya con la recuperación de periodo aplicada (y la homologada de los periodos anteriores a un traslado). */
  efectivas: Map<number, number>;
  /** Periodos en que la asignatura es exenta por traslado: no entran a la definitiva del año. */
  exentos: Set<number>;
}

export interface ContextoNotas {
  anio: AcademicYearDocument;
  politica: PoliticaRecuperacion;
  aprobatoria: number;
  decimales: number;
  /** `${asignación}|${estudiante}` */
  notas: Map<string, NotasDeEstudiante>;
  recuperaciones: Map<string, RecuperacionDocument>;
  /** `${asignación}|${estudiante}` → periodos que no entran a su promedio anual (promoción anticipada con DEJAR_SIN_NOTA). */
  omitidos: Map<string, Set<number>>;
}

export const clave = (asignacionId: unknown, estudianteId: unknown): string => `${String(asignacionId)}|${String(estudianteId)}`;
export const claveRecuperacion = (asignacionId: unknown, estudianteId: unknown, tipo: TipoRecuperacion, periodo: number): string =>
  `${clave(asignacionId, estudianteId)}|${tipo}|${periodo}`;

export async function cargarContextoNotas(anio: AcademicYearDocument, asignacionIds: Types.ObjectId[]): Promise<ContextoNotas> {
  const politicaDoc = await obtenerPolitica(anio);
  const escala = escalaEfectiva(anio.escala_evaluacion);
  const [calificaciones, recuperaciones, asignaciones, homologadas] = await Promise.all([
    CalificacionAsignatura.find({ teacher_assignment_id: { $in: asignacionIds }, estado: { $in: ESTADOS_NOTA_CERRADOS } }).lean(),
    Recuperacion.find({ teacher_assignment_id: { $in: asignacionIds }, academic_year_id: anio._id }),
    TeacherAssignment.find({ _id: { $in: asignacionIds } }).select('subject_id group_id').lean(),
    NotaHomologada.find({ academic_year_id: anio._id }).select('student_id subject_id periodo_numero estado nota').lean(),
  ]);

  const recuperacionesPorClave = new Map<string, RecuperacionDocument>();
  for (const r of recuperaciones) {
    recuperacionesPorClave.set(claveRecuperacion(r.teacher_assignment_id, r.student_id, r.tipo, r.periodo_numero), r);
  }

  const notas = new Map<string, NotasDeEstudiante>();
  for (const c of calificaciones) {
    if (!c.resultado) continue;
    const k = clave(c.teacher_assignment_id, c.student_id);
    const entrada = notas.get(k) ?? { cerradas: new Map(), efectivas: new Map(), exentos: new Set<number>() };
    entrada.cerradas.set(c.periodo_numero, c.resultado.nota_asignatura);
    const recuperada = recuperacionesPorClave.get(claveRecuperacion(c.teacher_assignment_id, c.student_id, 'PERIODO', c.periodo_numero));
    // Una recuperación que el colegio configuró como «solo anotar» no cambia la nota del periodo ni la definitiva del año.
    entrada.efectivas.set(c.periodo_numero, notaEfectivaDePeriodo(c.resultado.nota_asignatura, recuperada) ?? c.resultado.nota_asignatura);
    notas.set(k, entrada);
  }

  // Traslados: lo homologado cuenta en la definitiva del año (no es candidato a recuperar el periodo: no lo cerró un docente) y lo exento no entra.
  if (homologadas.length > 0) {
    const matriculas = await Enrollment.find({
      academic_year_id: anio._id,
      student_id: { $in: [...new Set(homologadas.map((h) => String(h.student_id)))] },
      estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
    })
      .select('student_id group_id')
      .lean();
    const grupoDe = new Map(matriculas.map((m) => [String(m.student_id), String(m.group_id)]));
    const asignacionDe = new Map(asignaciones.map((a) => [`${String(a.group_id)}|${String(a.subject_id)}`, a._id]));
    for (const h of homologadas) {
      const asignacionId = asignacionDe.get(`${grupoDe.get(String(h.student_id)) ?? ''}|${String(h.subject_id)}`);
      if (!asignacionId) continue;
      const k = clave(asignacionId, h.student_id);
      const entrada = notas.get(k) ?? { cerradas: new Map(), efectivas: new Map(), exentos: new Set<number>() };
      if (h.estado === 'EXENTA_POR_TRASLADO') entrada.exentos.add(h.periodo_numero);
      else if (h.nota !== null) entrada.efectivas.set(h.periodo_numero, h.nota);
      notas.set(k, entrada);
    }
  }

  const omitidos = await aplicarPromocionAnticipada(anio, asignacionIds, notas);

  return {
    anio,
    politica: politicaDoc.toObject() as unknown as PoliticaRecuperacion,
    aprobatoria: escala.nota_aprobatoria,
    decimales: escala.precision_decimales,
    notas,
    recuperaciones: recuperacionesPorClave,
    omitidos,
  };
}

/**
 * Un estudiante que subió de grado por promoción anticipada no cursó los primeros periodos del grado nuevo: lo que el colegio resolvió para cada
 * asignatura (nota copiada, nivelación o periodo sin nota) ocupa ese lugar. Una nota realmente cerrada en el grupo nuevo siempre manda.
 * Sin trámites aplicados no hace nada.
 */
async function aplicarPromocionAnticipada(anio: AcademicYearDocument, asignacionIds: Types.ObjectId[], notas: Map<string, NotasDeEstudiante>): Promise<Map<string, Set<number>>> {
  const omitidos = new Map<string, Set<number>>();
  const aplicadas = await PromocionAnticipada.find({ academic_year_id: anio._id, estado: 'APLICADA' }).lean();
  if (aplicadas.length === 0) return omitidos;
  const asignaciones = await TeacherAssignment.find({ _id: { $in: asignacionIds } }).select('subject_id group_id').lean();

  for (const tramite of aplicadas) {
    if (!tramite.aplicacion) continue;
    const noCursados = Array.from({ length: tramite.reglas.periodo_evaluacion }, (_, i) => i + 1);
    for (const asignacion of asignaciones) {
      if (String(asignacion.group_id) !== String(tramite.aplicacion.grupo_destino_id)) continue;
      const resuelta = tramite.aplicacion.notas.find((n) => String(n.subject_id) === String(asignacion.subject_id));
      if (!resuelta) continue;
      const k = clave(asignacion._id, tramite.student_id);
      const entrada = notas.get(k) ?? { cerradas: new Map(), efectivas: new Map(), exentos: new Set<number>() };
      for (const periodo of noCursados) {
        if (entrada.cerradas.has(periodo)) continue;
        if (resuelta.modo === 'SIN_NOTA') {
          omitidos.set(k, (omitidos.get(k) ?? new Set()).add(periodo));
          continue;
        }
        const valor = resuelta.modo === 'COPIADA' ? resuelta.nota : (resuelta.nivelacion?.nota ?? null);
        if (valor !== null && valor !== undefined) entrada.efectivas.set(periodo, valor);
      }
      notas.set(k, entrada);
    }
  }
  return omitidos;
}

/** La definitiva del año de una asignatura, o null si algún periodo aún no tiene nota cerrada. */
export function definitivaAnual(ctx: ContextoNotas, asignacionId: unknown, estudianteId: unknown): number | null {
  const entrada = ctx.notas.get(clave(asignacionId, estudianteId));
  if (!entrada) return null;
  // Un periodo «sin nota» sale del promedio: su porcentaje se reparte entre los restantes porque `notaAnual` normaliza por lo que queda.
  const vigentes = periodosParaPromediar(ctx.anio.periodos, ctx.omitidos.get(clave(asignacionId, estudianteId)) ?? new Set());
  return notaAnual(
    vigentes.map((p) => ({ porcentaje: p.porcentaje, nota: entrada.efectivas.get(p.numero) ?? null, exento: entrada.exentos.has(p.numero) })),
    ctx.decimales
  );
}

/** Cuántas asignaturas del grupo tiene perdidas el estudiante al cierre del año (para el tope de la recuperación anual). */
function asignaturasPerdidas(ctx: ContextoNotas, asignacionesDelGrupo: Types.ObjectId[], estudianteId: unknown): number {
  return contarReprobadas(
    asignacionesDelGrupo.map((id) => {
      const exentos = ctx.notas.get(clave(id, estudianteId))?.exentos ?? new Set<number>();
      return { nota: definitivaAnual(ctx, id, estudianteId), exenta: ctx.anio.periodos.length > 0 && ctx.anio.periodos.every((p) => exentos.has(p.numero)) };
    }),
    ctx.aprobatoria
  );
}

// --- Listado de quién debe recuperar ---

export interface FiltrosCandidatos {
  academic_year_id: string;
  tipo: TipoRecuperacion;
  periodo_numero?: number;
  teacher_assignment_id?: string;
  group_id?: string;
}

export interface FilaRecuperacion {
  teacher_assignment_id: string;
  group_id: string;
  grupo: string;
  subject_id: string;
  asignatura: string;
  estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string };
  nota_original: number;
  recuperacion: {
    _id: string;
    intentos: Array<{ _id: string; nota: number; fecha: Date; observacion: string }>;
    nota_resultante: number | null;
    efecto_aplicado: string;
    modo_integracion: string;
    detalle: string;
  } | null;
  estado: 'PENDIENTE' | 'SUPERADA' | 'NO_SUPERADA';
  intentos_restantes: number;
  /** Falso cuando no se puede registrar (p. ej. perdió más asignaturas de las que el colegio permite recuperar). */
  habilitado: boolean;
  motivo_no_habilitado: string | null;
}

export interface ListadoRecuperaciones {
  tipo: TipoRecuperacion;
  periodo_numero: number;
  aplica: boolean;
  /** Por qué no aplica (según la política del colegio), cuando `aplica` es falso. */
  motivo_no_aplica: string | null;
  momento: string | null;
  nota_aprobatoria: number;
  ventana: VentanaRecuperacion | null;
  filas: FilaRecuperacion[];
}

async function asignacionesAConsultar(filtros: FiltrosCandidatos, usuario: UserDocument): Promise<TeacherAssignmentDocument[]> {
  if (filtros.teacher_assignment_id) {
    const asignacion =
      usuario.rol === ROLES.DOCENTE
        ? await asignacionDelDocente(filtros.teacher_assignment_id, usuario)
        : await TeacherAssignment.findById(filtros.teacher_assignment_id);
    if (!asignacion) throw new ApiError(404, 'Asignación académica no encontrada.');
    return [asignacion];
  }
  if (usuario.rol === ROLES.DOCENTE) throw new ApiError(400, 'Indica la asignación (clase) sobre la que consultas.');
  if (!filtros.group_id) throw new ApiError(400, 'Indica un grupo o una asignación.');
  return TeacherAssignment.find({
    academic_year_id: filtros.academic_year_id,
    group_id: filtros.group_id,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
  });
}

export async function listarCandidatos(filtros: FiltrosCandidatos, usuario: UserDocument): Promise<ListadoRecuperaciones> {
  const anio = await cargarAnio(filtros.academic_year_id);
  const politicaDoc = await obtenerPolitica(anio);
  const politica = politicaDoc.toObject() as unknown as PoliticaRecuperacion;
  const periodoNumero = filtros.tipo === 'ANUAL' ? PERIODO_DE_RECUPERACION_ANUAL : filtros.periodo_numero ?? 0;
  if (filtros.tipo === 'PERIODO' && !anio.periodos.some((p) => p.numero === periodoNumero)) {
    throw new ApiError(400, `El año lectivo ${anio.year} no tiene periodo ${periodoNumero}.`);
  }

  const escala = escalaEfectiva(anio.escala_evaluacion);
  const regla = filtros.tipo === 'PERIODO' ? reglaDePeriodo(politica, periodoNumero) : null;
  const aplica = filtros.tipo === 'PERIODO' ? Boolean(regla?.aplica) : politica.anual.aplica;
  const base = {
    tipo: filtros.tipo,
    periodo_numero: periodoNumero,
    nota_aprobatoria: escala.nota_aprobatoria,
    momento: regla?.momento ?? null,
  };

  if (!aplica) {
    return {
      ...base,
      aplica: false,
      motivo_no_aplica:
        filtros.tipo === 'PERIODO'
          ? `El colegio no tiene recuperación para el periodo ${periodoNumero} (política del SIEE).`
          : 'El colegio no tiene recuperación de fin de año (política del SIEE).',
      ventana: null,
      filas: [],
    };
  }

  // En Preescolar nadie reprueba (Decreto 2247/1997): no hay quién recupere.
  const gradosSinReprobacion = new Set(await idsDeGradosSinReprobacion());
  const gruposSinReprobacion = new Set((await Group.find({ grade_id: { $in: [...gradosSinReprobacion] } }).select('_id').lean()).map((g) => String(g._id)));
  const asignaciones = (await asignacionesAConsultar(filtros, usuario)).filter((a) => !gruposSinReprobacion.has(String(a.group_id)));
  for (const a of asignaciones) {
    if (String(a.academic_year_id) !== String(anio._id)) throw new ApiError(400, 'La asignación no pertenece al año lectivo indicado.');
  }
  if (asignaciones.length === 0) {
    return { ...base, aplica: true, motivo_no_aplica: null, ventana: null, filas: [] };
  }

  // El tope de la anual se mide contra TODAS las asignaturas del grupo, no solo contra la que se consulta.
  const gruposIds = [...new Set(asignaciones.map((a) => String(a.group_id)))];
  const delGrupo = await TeacherAssignment.find({
    academic_year_id: anio._id,
    group_id: { $in: gruposIds },
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
  }).select('_id group_id');
  const idsDelGrupo = new Map<string, Types.ObjectId[]>();
  for (const a of delGrupo) idsDelGrupo.set(String(a.group_id), [...(idsDelGrupo.get(String(a.group_id)) ?? []), a._id]);

  const ctx = await cargarContextoNotas(anio, delGrupo.map((a) => a._id));
  const consultadas = new Set(asignaciones.map((a) => String(a._id)));
  const maxIntentos = filtros.tipo === 'PERIODO' ? politica.periodo.max_intentos : politica.anual.max_intentos;

  const [grupos, asignaturas] = await Promise.all([
    Group.find({ _id: { $in: gruposIds } }).select('nomenclatura'),
    Subject.find({ _id: { $in: asignaciones.map((a) => a.subject_id) } }).select('nombre'),
  ]);
  const nombreGrupo = new Map(grupos.map((g) => [String(g._id), g.nomenclatura]));
  const nombreAsignatura = new Map(asignaturas.map((s) => [String(s._id), s.nombre]));
  const porAsignacion = new Map(asignaciones.map((a) => [String(a._id), a]));

  interface Previa {
    asignacion: TeacherAssignmentDocument;
    estudianteId: string;
    notaOriginal: number;
    habilitado: boolean;
    motivo: string | null;
  }
  const previas: Previa[] = [];

  for (const [k, entrada] of ctx.notas) {
    const [asignacionId = '', estudianteId = ''] = k.split('|');
    if (!consultadas.has(asignacionId)) continue;
    const asignacion = porAsignacion.get(asignacionId) as TeacherAssignmentDocument;
    const existente = ctx.recuperaciones.get(claveRecuperacion(asignacionId, estudianteId, filtros.tipo, periodoNumero));

    let notaOriginal: number | null;
    if (filtros.tipo === 'PERIODO') notaOriginal = entrada.cerradas.get(periodoNumero) ?? null;
    else notaOriginal = definitivaAnual(ctx, asignacionId, estudianteId);
    if (existente) notaOriginal = existente.nota_original;
    if (notaOriginal === null) continue;
    if (!existente && !necesitaRecuperar(notaOriginal, ctx.aprobatoria)) continue;

    let habilitado = true;
    let motivo: string | null = null;
    if (filtros.tipo === 'ANUAL' && !existente && politica.anual.max_asignaturas_pendientes > 0) {
      const perdidas = asignaturasPerdidas(ctx, idsDelGrupo.get(String(asignacion.group_id)) ?? [], estudianteId);
      if (perdidas > politica.anual.max_asignaturas_pendientes) {
        habilitado = false;
        motivo = `Perdió ${perdidas} asignaturas; el colegio permite recuperar hasta ${politica.anual.max_asignaturas_pendientes}.`;
      }
    }
    previas.push({ asignacion, estudianteId, notaOriginal, habilitado, motivo });
  }

  const usuarios = await User.find({ _id: { $in: previas.map((p) => p.estudianteId) } }).select('nombre apellido numero_documento');
  const estudiantes = new Map(usuarios.map((u) => [String(u._id), u]));

  const filas: FilaRecuperacion[] = previas
    .map((p): FilaRecuperacion | null => {
      const u = estudiantes.get(p.estudianteId);
      if (!u) return null;
      const r = ctx.recuperaciones.get(claveRecuperacion(p.asignacion._id, p.estudianteId, filtros.tipo, periodoNumero)) ?? null;
      const intentos = r?.intentos.length ?? 0;
      const restantes = Math.max(0, maxIntentos - intentos);
      const estado = r?.estado ?? 'PENDIENTE';
      const sinIntentos = restantes === 0 && estado !== 'SUPERADA';
      return {
        teacher_assignment_id: String(p.asignacion._id),
        group_id: String(p.asignacion.group_id),
        grupo: nombreGrupo.get(String(p.asignacion.group_id)) ?? '',
        subject_id: String(p.asignacion.subject_id),
        asignatura: nombreAsignatura.get(String(p.asignacion.subject_id)) ?? '',
        estudiante: { _id: String(u._id), nombre: u.nombre, apellido: u.apellido, numero_documento: u.numero_documento },
        nota_original: p.notaOriginal,
        recuperacion: r
          ? {
              _id: String(r._id),
              intentos: r.intentos.map((i) => ({ _id: String(i._id), nota: i.nota, fecha: i.fecha, observacion: i.observacion })),
              nota_resultante: r.nota_resultante,
              efecto_aplicado: r.efecto_aplicado,
              modo_integracion: integracionDe(r.integracion).modo,
              detalle: r.detalle,
            }
          : null,
        estado,
        intentos_restantes: restantes,
        habilitado: p.habilitado && estado !== 'SUPERADA' && !sinIntentos,
        motivo_no_habilitado: p.motivo ?? (estado === 'SUPERADA' ? 'Ya superó la recuperación.' : sinIntentos ? 'Agotó los intentos permitidos.' : null),
      };
    })
    .filter((f): f is FilaRecuperacion => f !== null)
    .sort((a, b) => a.estudiante.apellido.localeCompare(b.estudiante.apellido, 'es') || a.estudiante.nombre.localeCompare(b.estudiante.nombre, 'es'));

  const ventana = evaluarVentana({
    tipo: filtros.tipo,
    periodoNumero,
    momento: regla?.momento ?? 'FIN_PERIODO',
    periodos: anio.periodos,
    eventos: anio.eventos,
    ahora: new Date(),
  });

  return { ...base, aplica: true, motivo_no_aplica: null, ventana, filas };
}

// --- Registrar un intento ---

/** Recalcula la nota de la asignatura con la recuperación metida entre las casillas de M12 (lo que el docente ya cerró no se toca). */
async function integrarSobreCasillas(
  asignacion: TeacherAssignmentDocument,
  periodoNumero: number,
  estudianteId: string,
  integracion: IntegracionPeriodo,
  notaRecuperacion: number,
  ctx: ContextoNotas
): Promise<ResultadoIntegracion> {
  const planilla = await cargarContextoPlanilla(asignacion, periodoNumero);
  if (integracion.bloque_clave && !planilla.bloques.some((b) => b.clave === integracion.bloque_clave)) {
    throw new ApiError(409, 'El bloque configurado para la recuperación ya no existe en el molde de notas del año. Revisa la política.');
  }
  const notas = new Map<string, number>();
  for (const c of planilla.casillas) {
    const nota = notaDeCasilla(planilla, c, estudianteId);
    if (nota !== null) notas.set(c.id, nota);
  }
  if (planilla.casillas.length === 0 || planilla.casillas.some((c) => !notas.has(c.id))) {
    throw new ApiError(409, 'La planilla de este estudiante no está completa; no se puede integrar la recuperación a sus notas.');
  }
  return integrarRecuperacion({
    integracion,
    bloques: planilla.bloques.map((b) => ({ clave: b.clave, nombre: b.nombre, porcentaje: b.porcentaje })),
    casillas: planilla.casillas.map((c) => ({ id: c.id, bloque: c.bloque, peso: c.peso, titulo: c.titulo })),
    notas,
    notaRecuperacion,
    notaAprobatoria: ctx.aprobatoria,
    decimales: ctx.decimales,
  });
}

export interface RegistrarIntentoInput {
  teacher_assignment_id: string;
  student_id: string;
  tipo: TipoRecuperacion;
  periodo_numero?: number;
  nota: number;
  observacion?: string;
}

/**
 * Registra el resultado de un intento. Solo el docente titular, solo con el año vigente y solo dentro de la ventana del calendario;
 * el servidor recalcula si el estudiante debe recuperar (no confía en lo que mostraba la pantalla).
 */
export async function registrarIntento(
  input: RegistrarIntentoInput,
  docente: UserDocument,
  ip?: string | null
): Promise<RecuperacionDocument> {
  const asignacion = await asignacionDelDocente(input.teacher_assignment_id, docente);
  if (asignacion.group_id && (await esGrupoSinReprobacion(asignacion.group_id))) throw new ApiError(409, 'En Preescolar no se reprueba ni se recupera (Decreto 2247 de 1997).');
  const anio = await cargarAnio(String(asignacion.academic_year_id));
  if (anio.estado !== 'EN_CURSO') throw new ApiError(409, `El año lectivo ${anio.year} no está vigente; no se pueden registrar recuperaciones.`);

  const politicaDoc = await obtenerPolitica(anio);
  const politica = politicaDoc.toObject() as unknown as PoliticaRecuperacion;
  const periodoNumero = input.tipo === 'ANUAL' ? PERIODO_DE_RECUPERACION_ANUAL : input.periodo_numero ?? 0;
  const regla = input.tipo === 'PERIODO' ? reglaDePeriodo(politica, periodoNumero) : null;

  if (input.tipo === 'PERIODO') {
    if (!anio.periodos.some((p) => p.numero === periodoNumero)) throw new ApiError(400, `El año lectivo ${anio.year} no tiene periodo ${periodoNumero}.`);
    if (!regla?.aplica) throw new ApiError(409, `El colegio no tiene recuperación para el periodo ${periodoNumero}.`);
  } else if (!politica.anual.aplica) {
    throw new ApiError(409, 'El colegio no tiene recuperación de fin de año.');
  }

  const ventana = evaluarVentana({
    tipo: input.tipo,
    periodoNumero,
    momento: regla?.momento ?? 'FIN_PERIODO',
    periodos: anio.periodos,
    eventos: anio.eventos,
    ahora: new Date(),
  });
  if (!ventana.abierta) throw new ApiError(409, ventana.motivo ?? 'La ventana de recuperación no está abierta.');

  const grupoId = asignacion.group_id as Types.ObjectId;
  const delGrupo = await TeacherAssignment.find({
    academic_year_id: anio._id,
    group_id: grupoId,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
  }).select('_id');
  const ctx = await cargarContextoNotas(anio, delGrupo.map((a) => a._id));

  const estudianteId = new Types.ObjectId(input.student_id);
  const entrada = ctx.notas.get(clave(asignacion._id, estudianteId));
  if (!entrada) throw new ApiError(409, 'El estudiante no tiene notas cerradas en esta asignatura.');

  const existente = ctx.recuperaciones.get(claveRecuperacion(asignacion._id, estudianteId, input.tipo, periodoNumero)) ?? null;
  let notaOriginal: number | null;
  if (existente) notaOriginal = existente.nota_original;
  else notaOriginal = input.tipo === 'PERIODO' ? entrada.cerradas.get(periodoNumero) ?? null : definitivaAnual(ctx, asignacion._id, estudianteId);
  if (notaOriginal === null) {
    throw new ApiError(
      409,
      input.tipo === 'PERIODO' ? `El periodo ${periodoNumero} de este estudiante aún no tiene nota cerrada.` : 'Aún faltan periodos por cerrar para calcular la definitiva del año.'
    );
  }

  if (!existente) {
    if (!necesitaRecuperar(notaOriginal, ctx.aprobatoria)) throw new ApiError(409, 'El estudiante no tiene que recuperar esta asignatura (la aprobó).');
    if (input.tipo === 'ANUAL' && politica.anual.max_asignaturas_pendientes > 0) {
      const perdidas = asignaturasPerdidas(ctx, delGrupo.map((a) => a._id), estudianteId);
      if (perdidas > politica.anual.max_asignaturas_pendientes) {
        throw new ApiError(409, `Perdió ${perdidas} asignaturas; el colegio permite recuperar hasta ${politica.anual.max_asignaturas_pendientes}.`);
      }
    }
  } else if (existente.estado === 'SUPERADA') {
    throw new ApiError(409, 'El estudiante ya superó esta recuperación.');
  }

  const maxIntentos = input.tipo === 'PERIODO' ? politica.periodo.max_intentos : politica.anual.max_intentos;
  if ((existente?.intentos.length ?? 0) >= maxIntentos) {
    throw new ApiError(409, `Se agotaron los ${maxIntentos} intento(s) permitidos para esta recuperación.`);
  }

  validarNotaDentroDeEscala(input.nota, anio.escala_evaluacion);

  const efecto = existente?.efecto_aplicado ?? (input.tipo === 'PERIODO' ? politica.periodo.efecto : politica.anual.efecto);
  // La integración se congela con el primer intento; la anual no tiene casillas, solo trabaja sobre la definitiva.
  const integracion =
    input.tipo === 'PERIODO'
      ? integracionDe(existente ? (existente.integracion) : politica.periodo.integracion)
      : integracionDe(null);
  const recuperacion =
    existente ??
    new Recuperacion({
      academic_year_id: anio._id,
      teacher_assignment_id: asignacion._id,
      group_id: grupoId,
      subject_id: asignacion.subject_id,
      student_id: estudianteId,
      tipo: input.tipo,
      periodo_numero: periodoNumero,
      nota_original: notaOriginal,
      efecto_aplicado: efecto,
      integracion,
    });

  recuperacion.intentos.push({
    nota: input.nota,
    fecha: new Date(),
    registrado_por: docente._id,
    observacion: input.observacion ?? '',
  });
  const mejor = mejorNota(recuperacion.intentos.map((i) => i.nota)) as number;
  if (integracion.modo === 'NOTA_FINAL') {
    recuperacion.nota_resultante = notaTrasRecuperar({
      efecto,
      notaOriginal,
      notaRecuperacion: mejor,
      notaAprobatoria: ctx.aprobatoria,
      decimales: ctx.decimales,
    });
    recuperacion.componentes = [];
    recuperacion.detalle = '';
  } else {
    const integrada = await integrarSobreCasillas(asignacion, periodoNumero, String(estudianteId), integracion, mejor, ctx);
    recuperacion.nota_resultante = integrada.nota;
    recuperacion.componentes = integrada.aplicada ? integrada.bloques : [];
    recuperacion.detalle = integrada.detalle;
  }
  recuperacion.estado = estadoDeRecuperacion(recuperacion.nota_resultante, ctx.aprobatoria);

  try {
    await recuperacion.save();
  } catch (err) {
    // Dos registros a la vez del primer intento: el índice único deja pasar solo uno.
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'Esta recuperación acaba de ser registrada por otra petición; actualiza e inténtalo de nuevo.');
    throw err;
  }

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'RECUPERACION_INTENTO_REGISTRADO',
    entidad: 'Recuperacion',
    entidad_id: recuperacion._id,
    detalle:
      `${input.tipo === 'ANUAL' ? 'Anual' : `Periodo ${periodoNumero}`}: intento ${recuperacion.intentos.length}, ` +
      `nota ${input.nota}, resultante ${recuperacion.nota_resultante}, ${recuperacion.estado}`,
    ip,
  });
  // El estudiante y su acudiente se enteran del resultado; un aviso que falla nunca deshace el registro.
  await avisarRecuperacionRegistrada(recuperacion, Math.max(0, maxIntentos - recuperacion.intentos.length));
  return recuperacion;
}
