import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_VIVOS } from '../constants/enums';
import { ESTADOS_NOTA_CERRADOS } from '../constants/notas';
import { EstadoNotaTraslado, MAX_PERIODOS_ORIGEN, MAX_SOPORTES_TRASLADO, MIN_LONGITUD_MOTIVO_TRASLADO } from '../constants/traslados';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import CalificacionAsignatura from '../models/calificacionAsignatura.model';
import Enrollment from '../models/enrollment.model';
import EscalaExterna, { EscalaExternaDocument } from '../models/escalaExterna.model';
import Group from '../models/group.model';
import NotaHomologada, { IEscalaUsada, IFuenteNotaHomologada, NotaHomologadaDocument } from '../models/notaHomologada.model';
import TrasladoExtemporaneo, { ICorrespondenciaPeriodo, IPeriodoOrigen, TrasladoExtemporaneoDocument } from '../models/trasladoExtemporaneo.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { inicioDelDia } from '../utils/calendarioAcademico';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { convertirNota, CorrespondenciaPeriodo, EscalaInstitucionalCalculo, notaDesdeFuentes, ResultadoConversion, sugerirCorrespondencia } from '../utils/homologacion';
import { redondear } from '../utils/recuperaciones';
import { runTransaction } from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { asignaturasEsperadas } from './inclusionContexto.service';

/**
 * Traslados extemporáneos (M04) y registro de notas homologadas (M26/M04). Secretaría registra cuándo llegó el estudiante y de dónde, y
 * las notas oficiales de su institución de procedencia: entran directo como definitiva del periodo (HOMOLOGADA_EXTERNA), sin pedirle a
 * ningún docente que califique actividades pasadas, o la asignatura se marca EXENTA_POR_TRASLADO si allá no se impartía.
 */

// --- Traslado ---

export interface TrasladoInput {
  fecha_ingreso: Date;
  periodo_ingreso: number;
  institucion_procedencia: { nombre: string; codigo_dane?: string; municipio?: string; calendario?: string };
  periodos_origen: Array<{ nombre: string; fecha_inicio?: Date | null; fecha_fin?: Date | null }>;
  escala_externa_id: string | null;
  correspondencia?: ICorrespondenciaPeriodo[];
  observaciones?: string;
}

export interface CrearTrasladoInput extends TrasladoInput {
  enrollment_id: string;
}

async function cargarAnio(id: Types.ObjectId | string): Promise<AcademicYearDocument> {
  const anio = await AcademicYear.findById(id);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  return anio;
}

function exigirAnioAbierto(anio: AcademicYearDocument): void {
  if (anio.estado === 'CERRADO') throw new ApiError(409, `El año lectivo ${anio.year} está cerrado y solo admite consulta.`);
}

/** Los periodos del año anteriores al de ingreso: los que se homologan. */
function periodosAHomologar(anio: AcademicYearDocument, periodoIngreso: number) {
  return [...anio.periodos].filter((p) => p.numero < periodoIngreso).sort((a, b) => a.numero - b.numero);
}

const nombrePeriodo = (anio: AcademicYearDocument, numero: number): string => anio.periodos.find((p) => p.numero === numero)?.nombre || `Periodo ${numero}`;

/** La correspondencia que rige: la que ajustó secretaría para cada periodo o, si no la tocó, la sugerida. */
export function correspondenciaEfectiva(
  anio: AcademicYearDocument,
  periodoIngreso: number,
  periodosOrigen: readonly IPeriodoOrigen[],
  guardada: readonly ICorrespondenciaPeriodo[]
): CorrespondenciaPeriodo[] {
  const sugerida = sugerirCorrespondencia(
    [...anio.periodos].sort((a, b) => a.numero - b.numero).map((p) => ({ numero: p.numero, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin })),
    periodosOrigen
  );
  return periodosAHomologar(anio, periodoIngreso).map((p) => {
    const propia = guardada.find((c) => c.periodo_numero === p.numero);
    if (propia) return { periodo_numero: p.numero, fuentes: propia.fuentes.map((f) => ({ indice_origen: f.indice_origen, peso: f.peso })) };
    return sugerida.find((c) => c.periodo_numero === p.numero) ?? { periodo_numero: p.numero, fuentes: [] };
  });
}

async function validarTraslado(
  anio: AcademicYearDocument,
  studentId: Types.ObjectId,
  input: TrasladoInput,
  existente: TrasladoExtemporaneoDocument | null
): Promise<void> {
  exigirAnioAbierto(anio);
  if (!anio.periodos.some((p) => p.numero === input.periodo_ingreso)) throw new ApiError(400, `El año lectivo ${anio.year} no tiene periodo ${input.periodo_ingreso}.`);

  const ahora = new Date();
  if (inicioDelDia(input.fecha_ingreso).getTime() > ahora.getTime()) throw new ApiError(400, 'La fecha de ingreso no puede ser futura.');
  const inicioAnio = Math.min(...anio.periodos.map((p) => p.fecha_inicio.getTime()));
  const finAnio = Math.max(...anio.periodos.map((p) => p.fecha_fin.getTime()));
  if (input.fecha_ingreso.getTime() < inicioAnio || input.fecha_ingreso.getTime() > finAnio) {
    throw new ApiError(400, `La fecha de ingreso debe estar dentro del año lectivo ${anio.year}.`);
  }

  if (input.periodos_origen.length === 0 || input.periodos_origen.length > MAX_PERIODOS_ORIGEN) {
    throw new ApiError(400, `Indica los periodos de la institución de procedencia (de 1 a ${MAX_PERIODOS_ORIGEN}).`);
  }
  for (const p of input.periodos_origen) {
    if (p.fecha_inicio && p.fecha_fin && p.fecha_inicio > p.fecha_fin) throw new ApiError(400, `Las fechas del periodo de origen «${p.nombre}» están al revés.`);
  }

  const aHomologar = new Set(periodosAHomologar(anio, input.periodo_ingreso).map((p) => p.numero));
  for (const c of input.correspondencia ?? []) {
    if (!aHomologar.has(c.periodo_numero)) throw new ApiError(400, `El periodo ${c.periodo_numero} no es anterior al de ingreso: no se homologa.`);
    for (const f of c.fuentes) {
      if (f.indice_origen < 0 || f.indice_origen >= input.periodos_origen.length) throw new ApiError(400, `La correspondencia del periodo ${c.periodo_numero} usa un periodo de origen que no existe.`);
    }
    if (c.fuentes.length > 0 && c.fuentes.every((f) => f.peso <= 0)) throw new ApiError(400, `Al menos un periodo de origen debe pesar en el periodo ${c.periodo_numero}.`);
  }

  if (input.escala_externa_id && String(input.escala_externa_id) !== String(existente?.escala_externa_id ?? '')) {
    const escala = await EscalaExterna.findById(input.escala_externa_id);
    if (!escala || escala.estado === 'inactivo') throw new ApiError(400, 'La escala de origen no existe o está desactivada.');
  }

  // Un periodo que el estudiante ya cursó aquí (con notas cerradas por su docente) no puede declararse anterior al ingreso.
  const cursado = await CalificacionAsignatura.findOne({
    student_id: studentId,
    academic_year_id: anio._id,
    periodo_numero: { $lt: input.periodo_ingreso },
    estado: { $in: ESTADOS_NOTA_CERRADOS },
  }).select('periodo_numero');
  if (cursado) {
    throw new ApiError(409, `El estudiante ya tiene notas cerradas por sus docentes en el ${nombrePeriodo(anio, cursado.periodo_numero)}: su ingreso no puede ser posterior a ese periodo.`);
  }

  if (existente) {
    const fuera = await NotaHomologada.findOne({ traslado_id: existente._id, periodo_numero: { $gte: input.periodo_ingreso } }).select('periodo_numero');
    if (fuera) {
      throw new ApiError(409, `Hay notas homologadas del ${nombrePeriodo(anio, fuera.periodo_numero)}, que ya no sería anterior al ingreso: quítalas primero.`);
    }
    const indiceUsado = await NotaHomologada.findOne({ traslado_id: existente._id, 'fuentes.indice_origen': { $gte: input.periodos_origen.length } }).select('_id');
    if (indiceUsado) throw new ApiError(409, 'Hay notas homologadas de un periodo de origen que quitaste: corrígelas primero.');
  }
}

function datosDelTraslado(input: TrasladoInput) {
  return {
    fecha_ingreso: input.fecha_ingreso,
    periodo_ingreso: input.periodo_ingreso,
    institucion_procedencia: {
      nombre: input.institucion_procedencia.nombre.trim(),
      codigo_dane: (input.institucion_procedencia.codigo_dane ?? '').trim(),
      municipio: (input.institucion_procedencia.municipio ?? '').trim(),
      calendario: (input.institucion_procedencia.calendario ?? '').trim(),
    },
    periodos_origen: input.periodos_origen.map((p) => ({ nombre: p.nombre.trim(), fecha_inicio: p.fecha_inicio ?? null, fecha_fin: p.fecha_fin ?? null })),
    escala_externa_id: input.escala_externa_id ? new Types.ObjectId(input.escala_externa_id) : null,
    correspondencia: input.correspondencia ?? [],
    observaciones: (input.observaciones ?? '').trim(),
  };
}

export async function crearTraslado(input: CrearTrasladoInput, usuario: UserDocument, ip?: string | null): Promise<TrasladoExtemporaneoDocument> {
  const matricula = await Enrollment.findById(input.enrollment_id);
  if (!matricula || !ESTADOS_MATRICULA_VIVOS.includes(matricula.estado)) throw new ApiError(404, 'Matrícula no encontrada o no vigente.');
  if (await TrasladoExtemporaneo.exists({ enrollment_id: matricula._id })) throw new ApiError(409, 'Esta matrícula ya tiene registrado su traslado: edítalo.');
  const anio = await cargarAnio(matricula.academic_year_id);
  await validarTraslado(anio, matricula.student_id, input, null);

  const traslado = await TrasladoExtemporaneo.create({
    ...datosDelTraslado(input),
    enrollment_id: matricula._id,
    student_id: matricula.student_id,
    academic_year_id: matricula.academic_year_id,
    registrado_por: usuario._id,
  });
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'TRASLADO_REGISTRADO',
    entidad: 'TrasladoExtemporaneo',
    entidad_id: traslado._id,
    detalle: `Ingreso el ${input.fecha_ingreso.toISOString().slice(0, 10)} en el periodo ${input.periodo_ingreso}, desde ${traslado.institucion_procedencia.nombre}.`,
    ip,
  });
  return traslado;
}

async function cargarTraslado(id: string): Promise<TrasladoExtemporaneoDocument> {
  const traslado = await TrasladoExtemporaneo.findById(id);
  if (!traslado) throw new ApiError(404, 'Traslado no encontrado.');
  return traslado;
}

export async function actualizarTraslado(id: string, input: TrasladoInput, usuario: UserDocument, ip?: string | null): Promise<TrasladoExtemporaneoDocument> {
  const traslado = await cargarTraslado(id);
  const anio = await cargarAnio(traslado.academic_year_id);
  await validarTraslado(anio, traslado.student_id, input, traslado);
  traslado.set(datosDelTraslado(input));
  await traslado.save();
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'TRASLADO_ACTUALIZADO',
    entidad: 'TrasladoExtemporaneo',
    entidad_id: traslado._id,
    detalle: `Ingreso el ${input.fecha_ingreso.toISOString().slice(0, 10)} en el periodo ${input.periodo_ingreso}.`,
    ip,
  });
  return traslado;
}

// --- Listado y matrículas disponibles ---

interface GrupoResumen {
  _id: Types.ObjectId;
  nomenclatura: string;
  grade_id: { nombre: string } | null;
  sede_id: { nombre: string } | null;
  jornada_id: { nombre: string } | null;
}

const nombreGrupo = (g: GrupoResumen | null): string => (g ? `${g.grade_id?.nombre ?? ''} ${g.nomenclatura}`.trim() : '');

export interface FilaTraslado {
  _id: string;
  enrollment_id: string;
  estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string };
  grupo: string;
  fecha_ingreso: Date;
  periodo_ingreso: number;
  nombre_periodo_ingreso: string;
  institucion_procedencia: string;
  /** Asignaturas × periodos anteriores al ingreso: cuántas celdas ya tienen nota homologada o están exentas. */
  avance: { esperadas: number; homologadas: number; exentas: number };
}

export async function listarTraslados(anioId: string, search?: string): Promise<FilaTraslado[]> {
  const anio = await cargarAnio(anioId);
  const traslados = await TrasladoExtemporaneo.find({ academic_year_id: anio._id }).sort({ fecha_ingreso: -1 }).lean();
  if (traslados.length === 0) return [];
  const [estudiantes, matriculas, conteos] = await Promise.all([
    User.find({ _id: { $in: traslados.map((t) => t.student_id) } }).select('nombre apellido numero_documento').lean(),
    Enrollment.find({ _id: { $in: traslados.map((t) => t.enrollment_id) } })
      .populate<{ group_id: GrupoResumen | null }>({ path: 'group_id', select: 'nomenclatura grade_id', populate: { path: 'grade_id', select: 'nombre' } })
      .lean(),
    NotaHomologada.aggregate<{ _id: { t: Types.ObjectId; e: EstadoNotaTraslado }; n: number }>([
      { $match: { traslado_id: { $in: traslados.map((t) => t._id) } } },
      { $group: { _id: { t: '$traslado_id', e: '$estado' }, n: { $sum: 1 } } },
    ]),
  ]);
  const estudiante = new Map(estudiantes.map((u) => [String(u._id), u]));
  const matricula = new Map(matriculas.map((m) => [String(m._id), m]));
  // Las celdas esperadas salen de la malla del grupo (M06); se cuentan por grupo para no leerla una vez por estudiante.
  const mallaPorGrupo = new Map<string, number>();
  for (const m of matriculas) {
    const grupoId = String(m.group_id?._id ?? '');
    if (!grupoId || mallaPorGrupo.has(grupoId)) continue;
    const grupo = await Group.findById(grupoId);
    mallaPorGrupo.set(grupoId, grupo ? (await asignaturasEsperadas(grupo)).length : 0);
  }
  const cuenta = (t: Types.ObjectId, e: EstadoNotaTraslado) => conteos.find((c) => String(c._id.t) === String(t) && c._id.e === e)?.n ?? 0;
  const texto = (search ?? '').trim().toLowerCase();

  return traslados
    .map((t): FilaTraslado | null => {
      const u = estudiante.get(String(t.student_id));
      const m = matricula.get(String(t.enrollment_id));
      if (!u) return null;
      const asignaturas = mallaPorGrupo.get(String(m?.group_id?._id ?? '')) ?? 0;
      return {
        _id: String(t._id),
        enrollment_id: String(t.enrollment_id),
        estudiante: { _id: String(u._id), nombre: u.nombre, apellido: u.apellido, numero_documento: u.numero_documento },
        grupo: nombreGrupo(m?.group_id ?? null),
        fecha_ingreso: t.fecha_ingreso,
        periodo_ingreso: t.periodo_ingreso,
        nombre_periodo_ingreso: nombrePeriodo(anio, t.periodo_ingreso),
        institucion_procedencia: t.institucion_procedencia.nombre,
        avance: { esperadas: asignaturas * periodosAHomologar(anio, t.periodo_ingreso).length, homologadas: cuenta(t._id, 'HOMOLOGADA_EXTERNA'), exentas: cuenta(t._id, 'EXENTA_POR_TRASLADO') },
      };
    })
    .filter((f): f is FilaTraslado => f !== null)
    .filter((f) => !texto || `${f.estudiante.nombre} ${f.estudiante.apellido} ${f.estudiante.numero_documento} ${f.institucion_procedencia}`.toLowerCase().includes(texto));
}

export interface MatriculaDisponible {
  enrollment_id: string;
  estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string };
  grupo: string;
  tipo_ingreso: string;
  fecha_matricula: Date;
}

/** Las matrículas vigentes del año que aún no tienen traslado registrado, para elegir a quién se le registra. */
export async function matriculasDisponibles(anioId: string): Promise<MatriculaDisponible[]> {
  const conTraslado = await TrasladoExtemporaneo.find({ academic_year_id: anioId }).distinct('enrollment_id');
  const matriculas = await Enrollment.find({ academic_year_id: anioId, estado: { $in: ESTADOS_MATRICULA_VIVOS }, _id: { $nin: conTraslado } })
    .populate<{ student_id: { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string } | null }>('student_id', 'nombre apellido numero_documento')
    .populate<{ group_id: GrupoResumen | null }>({ path: 'group_id', select: 'nomenclatura grade_id', populate: { path: 'grade_id', select: 'nombre' } })
    .lean();
  return matriculas
    .filter((m) => m.student_id)
    .map((m) => {
      const s = m.student_id as { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string };
      return {
        enrollment_id: String(m._id),
        estudiante: { _id: String(s._id), nombre: s.nombre, apellido: s.apellido, numero_documento: s.numero_documento },
        grupo: nombreGrupo(m.group_id),
        tipo_ingreso: m.tipo_ingreso,
        fecha_matricula: m.fecha_matricula,
      };
    })
    .sort((a, b) => `${a.estudiante.apellido} ${a.estudiante.nombre}`.localeCompare(`${b.estudiante.apellido} ${b.estudiante.nombre}`, 'es'));
}

// --- Homologación: de las notas del certificado de origen a la definitiva de cada periodo local ---

export interface ValorOrigenInput {
  indice_origen: number;
  valor_original: string;
}

export interface FilaHomologacionInput {
  subject_id: string;
  exenta: boolean;
  motivo?: string;
  asignatura_origen?: string;
  valores: ValorOrigenInput[];
}

export interface ResultadoCelda {
  subject_id: string;
  periodo_numero: number;
  estado: EstadoNotaTraslado | 'PENDIENTE';
  nota: number | null;
  fuentes: IFuenteNotaHomologada[];
  /** Por qué sigue pendiente (qué nota de origen falta). */
  faltan: string[];
}

export interface ErrorHomologacion {
  subject_id: string;
  asignatura: string;
  periodo_origen: string;
  mensaje: string;
}

interface ContextoHomologacion {
  traslado: TrasladoExtemporaneoDocument;
  anio: AcademicYearDocument;
  correspondencia: CorrespondenciaPeriodo[];
  escalaUsada: IEscalaUsada;
  escalaDoc: EscalaExternaDocument | null;
  destino: EscalaInstitucionalCalculo;
  asignaturas: Array<{ subject_id: string; nombre: string; area: string }>;
}

async function cargarContextoHomologacion(traslado: TrasladoExtemporaneoDocument): Promise<ContextoHomologacion> {
  const anio = await cargarAnio(traslado.academic_year_id);
  const matricula = await Enrollment.findById(traslado.enrollment_id);
  const grupo = matricula ? await Group.findById(matricula.group_id) : null;
  const escalaDoc = traslado.escala_externa_id ? await EscalaExterna.findById(traslado.escala_externa_id) : null;
  const escala = escalaEfectiva(anio.escala_evaluacion);
  return {
    traslado,
    anio,
    correspondencia: correspondenciaEfectiva(anio, traslado.periodo_ingreso, traslado.periodos_origen, traslado.correspondencia),
    escalaDoc,
    escalaUsada: escalaDoc
      ? {
          escala_externa_id: escalaDoc._id,
          nombre: escalaDoc.nombre,
          tipo: escalaDoc.tipo,
          valor_minimo: escalaDoc.valor_minimo,
          valor_maximo: escalaDoc.valor_maximo,
          valor_aprobatorio: escalaDoc.valor_aprobatorio,
        }
      : { escala_externa_id: null, nombre: 'Escala institucional', tipo: 'INSTITUCIONAL', valor_minimo: escala.nota_minima, valor_maximo: escala.nota_maxima, valor_aprobatorio: escala.nota_aprobatoria },
    destino: { nota_minima: escala.nota_minima, nota_maxima: escala.nota_maxima, nota_aprobatoria: escala.nota_aprobatoria, precision_decimales: escala.precision_decimales },
    asignaturas: grupo ? (await asignaturasEsperadas(grupo)).map((a) => ({ subject_id: a.subject_id, nombre: a.nombre, area: a.area })) : [],
  };
}

/** Sin escala de origen la nota ya viene en la del colegio: solo se valida que esté dentro de sus límites. */
function convertir(ctx: ContextoHomologacion, valor: string): ResultadoConversion {
  if (ctx.escalaDoc) return convertirNota(ctx.escalaDoc, valor, ctx.destino);
  const numero = Number(valor.trim().replace(',', '.'));
  if (!valor.trim() || !Number.isFinite(numero)) return { ok: false, error: `«${valor}» no es un número.` };
  if (numero < ctx.destino.nota_minima || numero > ctx.destino.nota_maxima) {
    return { ok: false, error: `${numero} está fuera de la escala del año [${ctx.destino.nota_minima}, ${ctx.destino.nota_maxima}].` };
  }
  return { ok: true, nota: redondear(numero, ctx.destino.precision_decimales) };
}

/** Calcula, sin guardar, qué queda en cada asignatura y periodo local. Los errores de conversión se juntan todos (no se corta en el primero). */
function calcularHomologacion(ctx: ContextoHomologacion, filas: readonly FilaHomologacionInput[]): { resultados: ResultadoCelda[]; errores: ErrorHomologacion[] } {
  const resultados: ResultadoCelda[] = [];
  const errores: ErrorHomologacion[] = [];
  const nombreAsignatura = new Map(ctx.asignaturas.map((a) => [a.subject_id, a.nombre]));
  const origen = ctx.traslado.periodos_origen;

  for (const fila of filas) {
    const convertidas = new Map<number, { valor: string; nota: number }>();
    for (const v of fila.valores) {
      if (!v.valor_original.trim()) continue;
      const periodoOrigen = origen[v.indice_origen]?.nombre ?? `#${v.indice_origen + 1}`;
      if (!origen[v.indice_origen]) {
        errores.push({ subject_id: fila.subject_id, asignatura: nombreAsignatura.get(fila.subject_id) ?? '', periodo_origen: periodoOrigen, mensaje: 'Ese periodo de origen no existe.' });
        continue;
      }
      if (fila.exenta) continue;
      const r = convertir(ctx, v.valor_original);
      if (r.ok) convertidas.set(v.indice_origen, { valor: v.valor_original.trim(), nota: r.nota });
      else errores.push({ subject_id: fila.subject_id, asignatura: nombreAsignatura.get(fila.subject_id) ?? '', periodo_origen: periodoOrigen, mensaje: r.error });
    }

    for (const corr of ctx.correspondencia) {
      const base = { subject_id: fila.subject_id, periodo_numero: corr.periodo_numero };
      if (fila.exenta) {
        resultados.push({ ...base, estado: 'EXENTA_POR_TRASLADO', nota: null, fuentes: [], faltan: [] });
        continue;
      }
      const necesarias = corr.fuentes.filter((f) => f.peso > 0);
      const faltan = necesarias.filter((f) => !convertidas.has(f.indice_origen)).map((f) => origen[f.indice_origen]?.nombre ?? '');
      if (necesarias.length === 0 || faltan.length > 0) {
        resultados.push({ ...base, estado: 'PENDIENTE', nota: null, fuentes: [], faltan: necesarias.length === 0 ? ['correspondencia de periodos'] : faltan });
        continue;
      }
      const fuentes: IFuenteNotaHomologada[] = necesarias.map((f) => {
        const c = convertidas.get(f.indice_origen) as { valor: string; nota: number };
        return {
          indice_origen: f.indice_origen,
          periodo_origen: origen[f.indice_origen]?.nombre ?? '',
          valor_original: c.valor,
          escala: ctx.escalaUsada,
          nota_convertida: c.nota,
          peso: f.peso,
        };
      });
      resultados.push({ ...base, estado: 'HOMOLOGADA_EXTERNA', nota: notaDesdeFuentes(fuentes, ctx.destino.precision_decimales), fuentes, faltan: [] });
    }
  }
  return { resultados, errores };
}

function exigirFilasValidas(ctx: ContextoHomologacion, filas: readonly FilaHomologacionInput[]): void {
  const deLaMalla = new Set(ctx.asignaturas.map((a) => a.subject_id));
  const vistas = new Set<string>();
  for (const f of filas) {
    if (!deLaMalla.has(f.subject_id)) throw new ApiError(400, 'Una de las asignaturas no está en el plan de estudios del grupo del estudiante.');
    if (vistas.has(f.subject_id)) throw new ApiError(400, 'Hay una asignatura repetida.');
    vistas.add(f.subject_id);
    if (f.exenta && (f.motivo ?? '').trim().length < MIN_LONGITUD_MOTIVO_TRASLADO) {
      throw new ApiError(400, `Explica por qué ${ctx.asignaturas.find((a) => a.subject_id === f.subject_id)?.nombre ?? 'la asignatura'} es exenta (mínimo ${MIN_LONGITUD_MOTIVO_TRASLADO} caracteres).`);
    }
  }
}

export async function vistaPreviaHomologacion(id: string, filas: FilaHomologacionInput[]) {
  const ctx = await cargarContextoHomologacion(await cargarTraslado(id));
  exigirFilasValidas(ctx, filas);
  return calcularHomologacion(ctx, filas);
}

const mismaFuente = (a: readonly IFuenteNotaHomologada[], b: readonly IFuenteNotaHomologada[]): boolean =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i] as IFuenteNotaHomologada;
    return x.indice_origen === y.indice_origen && x.valor_original === y.valor_original && x.nota_convertida === y.nota_convertida && x.peso === y.peso && x.escala.nombre === y.escala.nombre;
  });

export interface GuardarHomologacionInput {
  filas: FilaHomologacionInput[];
  /** Obligatorio si se corrige o se quita algo ya registrado. */
  motivo_cambio?: string;
}

/**
 * Guarda lo que quedó de cada asignatura enviada en cada periodo anterior al ingreso: crea, corrige (conservando lo anterior en el
 * historial) o quita (lo que quedó pendiente). Todo o nada: con un error de conversión no se guarda nada.
 */
export async function guardarHomologacion(id: string, input: GuardarHomologacionInput, usuario: UserDocument, ip?: string | null) {
  const traslado = await cargarTraslado(id);
  const ctx = await cargarContextoHomologacion(traslado);
  exigirAnioAbierto(ctx.anio);
  exigirFilasValidas(ctx, input.filas);
  const { resultados, errores } = calcularHomologacion(ctx, input.filas);
  if (errores.length > 0) throw new ApiError(400, `Hay ${errores.length} nota(s) de origen que no se pudieron convertir: no se guardó nada.`, errores);

  const existentes = await NotaHomologada.find({ traslado_id: traslado._id, subject_id: { $in: input.filas.map((f) => f.subject_id) } });
  const existente = new Map(existentes.map((n) => [`${String(n.subject_id)}|${n.periodo_numero}`, n]));
  const filaDe = new Map(input.filas.map((f) => [f.subject_id, f]));

  const crear: ResultadoCelda[] = [];
  const corregir: Array<{ doc: NotaHomologadaDocument; r: ResultadoCelda }> = [];
  const quitar: NotaHomologadaDocument[] = [];
  for (const r of resultados) {
    const previa = existente.get(`${r.subject_id}|${r.periodo_numero}`);
    const fila = filaDe.get(r.subject_id) as FilaHomologacionInput;
    if (r.estado === 'PENDIENTE') {
      if (previa) quitar.push(previa);
      continue;
    }
    if (!previa) {
      crear.push(r);
      continue;
    }
    const igual =
      previa.estado === r.estado &&
      previa.nota === r.nota &&
      mismaFuente(previa.fuentes, r.fuentes) &&
      previa.motivo === (r.estado === 'EXENTA_POR_TRASLADO' ? (fila.motivo ?? '').trim() : '') &&
      previa.asignatura_origen === (fila.asignatura_origen ?? '').trim();
    if (!igual) corregir.push({ doc: previa, r });
  }

  const motivoCambio = (input.motivo_cambio ?? '').trim();
  if ((corregir.length > 0 || quitar.length > 0) && motivoCambio.length < MIN_LONGITUD_MOTIVO_TRASLADO) {
    throw new ApiError(400, `Estás corrigiendo o quitando notas ya registradas: explica el motivo (mínimo ${MIN_LONGITUD_MOTIVO_TRASLADO} caracteres).`);
  }

  const ahora = new Date();
  const datosDe = (r: ResultadoCelda) => {
    const fila = filaDe.get(r.subject_id) as FilaHomologacionInput;
    return {
      estado: r.estado as EstadoNotaTraslado,
      nota: r.nota,
      fuentes: r.fuentes,
      asignatura_origen: (fila.asignatura_origen ?? '').trim(),
      motivo: r.estado === 'EXENTA_POR_TRASLADO' ? (fila.motivo ?? '').trim() : '',
      escala_institucional: ctx.destino,
      registrado_por: usuario._id,
    };
  };

  await runTransaction(async (session) => {
    if (crear.length > 0) {
      await NotaHomologada.create(
        crear.map((r) => ({
          ...datosDe(r),
          traslado_id: traslado._id,
          student_id: traslado.student_id,
          academic_year_id: traslado.academic_year_id,
          subject_id: r.subject_id,
          periodo_numero: r.periodo_numero,
        })),
        { session, ordered: true }
      );
    }
    for (const { doc, r } of corregir) {
      doc.historial.push({ fecha: ahora, por: usuario._id, estado_anterior: doc.estado, nota_anterior: doc.nota, fuentes_anteriores: doc.fuentes, motivo: motivoCambio });
      doc.set(datosDe(r));
      await doc.save({ session });
    }
    if (quitar.length > 0) await NotaHomologada.deleteMany({ _id: { $in: quitar.map((d) => d._id) } }, { session });
  });

  // La nota y la escala de origen quedan en el registro (y su historial); la bitácora dice qué cambió y por qué.
  const base = { usuario_id: usuario._id, entidad: 'TrasladoExtemporaneo', entidad_id: traslado._id, ip };
  if (crear.length > 0) await registrarEvento({ ...base, accion: 'NOTA_HOMOLOGADA_REGISTRADA', detalle: `${crear.length} nota(s) homologada(s) o exenta(s) registradas.` });
  if (corregir.length > 0) await registrarEvento({ ...base, accion: 'NOTA_HOMOLOGADA_MODIFICADA', detalle: `${corregir.length} nota(s) corregidas. Motivo: ${motivoCambio}` });
  if (quitar.length > 0) {
    const resumen = quitar.map((d) => `${ctx.asignaturas.find((a) => a.subject_id === String(d.subject_id))?.nombre ?? 'Asignatura'} P${d.periodo_numero}: ${d.estado === 'EXENTA_POR_TRASLADO' ? 'exenta' : d.nota}`).join('; ');
    await registrarEvento({ ...base, accion: 'NOTA_HOMOLOGADA_ELIMINADA', detalle: `${quitar.length} nota(s) quitadas (${resumen}). Motivo: ${motivoCambio}` });
  }
  return detalleTraslado(id);
}

// --- Detalle (la «planilla» de homologación) ---

/** `historial.por` llega poblado con nombre y apellido. */
function nombreDe(por: unknown): string {
  const u = por as { nombre?: string; apellido?: string } | null;
  return u?.nombre ? `${u.nombre} ${u.apellido ?? ''}`.trim() : '';
}

export async function detalleTraslado(id: string) {
  const traslado = await cargarTraslado(id);
  const ctx = await cargarContextoHomologacion(traslado);
  const [estudiante, matricula, notas] = await Promise.all([
    User.findById(traslado.student_id).select('nombre apellido numero_documento').lean(),
    Enrollment.findById(traslado.enrollment_id)
      .populate<{ group_id: GrupoResumen | null }>({
        path: 'group_id',
        select: 'nomenclatura grade_id sede_id jornada_id',
        populate: [
          { path: 'grade_id', select: 'nombre' },
          { path: 'sede_id', select: 'nombre' },
          { path: 'jornada_id', select: 'nombre' },
        ],
      })
      .lean(),
    NotaHomologada.find({ traslado_id: traslado._id }).populate('historial.por', 'nombre apellido').lean(),
  ]);

  const filas = ctx.asignaturas.map((a) => {
    const propias = notas.filter((n) => String(n.subject_id) === a.subject_id);
    const valores = new Map<number, string>();
    for (const n of propias) for (const f of n.fuentes) valores.set(f.indice_origen, f.valor_original);
    const exenta = propias.length > 0 && propias.every((n) => n.estado === 'EXENTA_POR_TRASLADO');
    return {
      subject_id: a.subject_id,
      nombre: a.nombre,
      area: a.area,
      exenta,
      motivo: exenta ? propias[0]?.motivo ?? '' : '',
      asignatura_origen: propias.find((n) => n.asignatura_origen)?.asignatura_origen ?? '',
      valores: [...valores.entries()].map(([indice_origen, valor_original]) => ({ indice_origen, valor_original })),
      resultados: ctx.correspondencia.map((c) => {
        const n = propias.find((x) => x.periodo_numero === c.periodo_numero);
        return {
          periodo_numero: c.periodo_numero,
          estado: (n?.estado ?? 'PENDIENTE') as EstadoNotaTraslado | 'PENDIENTE',
          nota: n?.nota ?? null,
          fuentes: n?.fuentes ?? [],
          historial: (n?.historial ?? []).map((h) => ({
            fecha: h.fecha,
            por: nombreDe(h.por),
            estado_anterior: h.estado_anterior,
            nota_anterior: h.nota_anterior,
            fuentes_anteriores: h.fuentes_anteriores,
            motivo: h.motivo,
          })),
        };
      }),
    };
  });

  const grupo = matricula?.group_id ?? null;
  return {
    _id: String(traslado._id),
    enrollment_id: String(traslado.enrollment_id),
    estudiante: estudiante ? { _id: String(estudiante._id), nombre: estudiante.nombre, apellido: estudiante.apellido, numero_documento: estudiante.numero_documento } : null,
    grupo: grupo ? { nombre: nombreGrupo(grupo), sede: grupo.sede_id?.nombre ?? '', jornada: grupo.jornada_id?.nombre ?? '' } : null,
    anio: { _id: String(ctx.anio._id), year: ctx.anio.year, estado: ctx.anio.estado },
    fecha_ingreso: traslado.fecha_ingreso,
    periodo_ingreso: traslado.periodo_ingreso,
    institucion_procedencia: traslado.institucion_procedencia,
    periodos_origen: traslado.periodos_origen.map((p) => ({ nombre: p.nombre, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin })),
    escala_externa_id: traslado.escala_externa_id ? String(traslado.escala_externa_id) : null,
    escala: ctx.escalaUsada,
    escala_institucional: ctx.destino,
    observaciones: traslado.observaciones,
    correspondencia_guardada: traslado.correspondencia.map((c) => ({ periodo_numero: c.periodo_numero, fuentes: c.fuentes.map((f) => ({ indice_origen: f.indice_origen, peso: f.peso })) })),
    correspondencia: ctx.correspondencia,
    periodos: periodosAHomologar(ctx.anio, traslado.periodo_ingreso).map((p) => ({ numero: p.numero, nombre: p.nombre || `Periodo ${p.numero}` })),
    periodos_anio: [...ctx.anio.periodos].sort((a, b) => a.numero - b.numero).map((p) => ({ numero: p.numero, nombre: p.nombre || `Periodo ${p.numero}`, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin })),
    soportes: traslado.soportes.map((s) => ({ _id: String(s._id), nombre: s.nombre, mimetype: s.mimetype, tamano: s.tamano, fecha: s.fecha })),
    filas,
    editable: ctx.anio.estado !== 'CERRADO',
  };
}

// --- Soportes documentales ---

export async function agregarSoporte(
  id: string,
  archivo: { nombre: string; archivo_path: string; mimetype: string; tamano: number },
  usuario: UserDocument,
  ip?: string | null
) {
  const traslado = await cargarTraslado(id);
  exigirAnioAbierto(await cargarAnio(traslado.academic_year_id));
  if (traslado.soportes.length >= MAX_SOPORTES_TRASLADO) throw new ApiError(409, `Un traslado admite hasta ${MAX_SOPORTES_TRASLADO} soportes: quita uno antes.`);
  traslado.soportes.push({ ...archivo, cargado_por: usuario._id, fecha: new Date() });
  await traslado.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'TRASLADO_SOPORTE_CARGADO', entidad: 'TrasladoExtemporaneo', entidad_id: traslado._id, detalle: archivo.nombre, ip });
  return detalleTraslado(id);
}

export async function archivoDeSoporte(id: string, soporteId: string, usuario: UserDocument, ip?: string | null): Promise<{ ruta: string; nombre: string }> {
  const traslado = await cargarTraslado(id);
  const soporte = traslado.soportes.id(soporteId);
  if (!soporte) throw new ApiError(404, 'Soporte no encontrado.');
  await registrarEvento({ usuario_id: usuario._id, accion: 'TRASLADO_SOPORTE_DESCARGADO', entidad: 'TrasladoExtemporaneo', entidad_id: traslado._id, detalle: soporte.nombre, ip });
  return { ruta: soporte.archivo_path, nombre: soporte.nombre };
}

/** Quita el soporte del traslado y devuelve su ruta para que el controlador borre el archivo. */
export async function quitarSoporte(id: string, soporteId: string, usuario: UserDocument, ip?: string | null): Promise<string> {
  const traslado = await cargarTraslado(id);
  exigirAnioAbierto(await cargarAnio(traslado.academic_year_id));
  const soporte = traslado.soportes.id(soporteId);
  if (!soporte) throw new ApiError(404, 'Soporte no encontrado.');
  const ruta = soporte.archivo_path;
  soporte.deleteOne();
  await traslado.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'TRASLADO_SOPORTE_ELIMINADO', entidad: 'TrasladoExtemporaneo', entidad_id: traslado._id, detalle: soporte.nombre, ip });
  return ruta;
}
