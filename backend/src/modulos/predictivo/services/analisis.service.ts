/**
 * El análisis de UN estudiante en un año: por asignatura, la nota parcial, la nota que le falta, la probabilidad de perderla (red de
 * Brain.js) y su FODA; en general, el riesgo de no promoción con la política del colegio y el FODA del estudiante. Qué ve cada perfil lo
 * decide `vistaDelAnalisis`: la probabilidad y el riesgo solo el personal; lo de convivencia solo quien puede ver convivencia. Solo lee
 * (salvo la política de promoción, que M19 crea al pedirla si aún no existe).
 */
import { NeuralNetwork } from 'brain.js';
import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../../../constants/enums';
import { ROLES } from '../../../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../../../models/academicYear.model';
import Enrollment from '../../../models/enrollment.model';
import Group from '../../../models/group.model';
import User, { UserDocument } from '../../../models/user.model';
import { registrarEvento } from '../../../services/audit.service';
import { datosDePolitica, obtenerPolitica } from '../../../services/politicaPromocion.service';
import { exigirAcudienteDe } from '../../../services/portalAcudiente.service';
import { ApiError } from '../../../utils/ApiError';
import { memorizar } from '../../../utils/cacheCorta';
import { resolverDesempeno } from '../../../utils/escalaEvaluacion';
import { PoliticaPromocion } from '../../../utils/promocion';
import { notaAnual } from '../../../utils/recuperaciones';
import { NIVELES_RIESGO, NivelRiesgo, TTL_ANALISIS_MS, VERSION_ENTRADAS } from '../constants/predictivo';
import { MODELO_DEMOSTRACION } from '../modeloDemostracion';
import ModeloPredictivo from '../models/modeloPredictivo.model';
import { aVector, corteVigente, DatosAlCorte, entradasDeAsignatura, notaDelAnioAnterior } from '../utils/caracteristicas';
import { cargarRed, probabilidad, RedGuardada } from '../utils/entrenamiento';
import { Foda, fodaDeAsignatura, fodaGeneral } from '../utils/foda';
import { NotaRequerida, notaRequerida } from '../utils/notaRequerida';
import { puedePredictivo, vistaDelAnalisis } from '../utils/permisos';
import { riesgoDePromocion, RiesgoPromocion } from '../utils/riesgoPromocion';
import { anioAnteriorDe, cargarDatosDelAnio, escalaDeNotas } from './datos.service';

interface ModeloEnUso {
  clave: string;
  origen: 'ENTRENADO' | 'DEMOSTRACION';
  version: number | null;
  es_demostracion: boolean;
  red: NeuralNetwork<number[], number[]>;
}

const redes = new Map<string, NeuralNetwork<number[], number[]>>();

/** El modelo activo o, si no hay ninguno entrenado, el de demostración. `null` si tampoco existe. La red se carga una vez por versión. */
async function modeloEnUso(): Promise<ModeloEnUso | null> {
  const activo = await ModeloPredictivo.findOne({ activo: true, version_entradas: VERSION_ENTRADAS }).select('version es_demostracion');
  if (activo) {
    const clave = `m${String(activo._id)}`;
    let red = redes.get(clave);
    if (!red) {
      const conRed = await ModeloPredictivo.findById(activo._id).select('+red');
      red = cargarRed(conRed?.red as RedGuardada);
      redes.set(clave, red);
    }
    return { clave, origen: 'ENTRENADO', version: activo.version, es_demostracion: activo.es_demostracion, red };
  }
  if (MODELO_DEMOSTRACION && MODELO_DEMOSTRACION.version_entradas === VERSION_ENTRADAS) {
    let red = redes.get('demo');
    if (!red) {
      red = cargarRed(MODELO_DEMOSTRACION.red);
      redes.set('demo', red);
    }
    return { clave: 'demo', origen: 'DEMOSTRACION', version: null, es_demostracion: true, red };
  }
  return null;
}

export function nivelDeRiesgo(p: number): NivelRiesgo {
  return [...NIVELES_RIESGO].reverse().find((n) => p >= n.desde)?.nivel ?? 'BAJO';
}

/** La vigencia activa o, si no hay, el año más reciente sin cerrar (como el resto del sistema). */
async function anioDeTrabajo(academicYearId?: string): Promise<AcademicYearDocument> {
  const anio = academicYearId
    ? await AcademicYear.findById(academicYearId)
    : ((await AcademicYear.findOne({ estado: 'EN_CURSO' })) ?? (await AcademicYear.findOne({ estado: { $ne: 'CERRADO' } }).sort({ year: -1, createdAt: -1 })));
  if (!anio) throw new ApiError(academicYearId ? 404 : 409, academicYearId ? 'Año lectivo no encontrado.' : 'No hay un año lectivo en curso.');
  return anio;
}

export interface AsignaturaAnalizada {
  subject_id: string;
  nombre: string;
  nota: number | null;
  desempeno: string | null;
  nivel: string | null;
  nota_requerida: NotaRequerida;
  /** Solo para el personal. */
  probabilidad?: number | null;
  riesgo?: NivelRiesgo | null;
  foda: Foda;
}

export interface AnalisisEstudiante {
  estudiante: { _id: string; nombre: string; apellido: string; grado: number; grupo: string };
  anio: { _id: string; year: number };
  corte: number;
  total_periodos: number;
  /** Decimales de la escala del año (M05), para mostrar las notas. */
  decimales: number;
  estado: 'LISTO' | 'SIN_DATOS';
  modelo: { origen: 'ENTRENADO' | 'DEMOSTRACION' | null; version: number | null; aviso: string | null };
  general: { promedio: number | null; desempeno: string | null; nivel: string | null; asignaturas_perdiendo: number; riesgo?: RiesgoPromocion | null };
  foda: Foda;
  asignaturas: AsignaturaAnalizada[];
  ve: { probabilidad: boolean; convivencia: boolean };
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Una nota fuera de la escala (dato viejo o escala cambiada) no tumba el análisis: queda sin desempeño. */
function desempenoDe(nota: number | null, escala: Parameters<typeof resolverDesempeno>[1]) {
  if (nota === null) return null;
  try {
    return resolverDesempeno(nota, escala);
  } catch {
    return null;
  }
}

async function calcular(anio: AcademicYearDocument, studentId: string, modelo: ModeloEnUso | null, ve: { probabilidad: boolean; convivencia: boolean }): Promise<AnalisisEstudiante | null> {
  const [datos, anteriores, usuario] = await Promise.all([
    cargarDatosDelAnio(anio, [studentId]),
    anioAnteriorDe(anio, [studentId]),
    User.findById(studentId).select('nombre apellido'),
  ]);
  const est = datos.estudiantes.get(studentId);
  if (!est || !usuario) return null;

  const n = datos.periodos.length;
  const corte = corteVigente(datos.cerrados);
  const escala = escalaDeNotas(datos.escala);
  const decimales = datos.escala.precision_decimales ?? 1;
  const porcentajeDe = new Map(datos.periodos.map((p) => [p.numero, p.porcentaje]));
  const anterior = anteriores.get(studentId) ?? null;
  const alCorte: DatosAlCorte = { corte: Math.min(corte, n - 1), totalPeriodos: n, escala, asignaturas: est.asignaturas, faltas: est.faltas, esRepitente: est.es_repitente, anterior };

  let registros = 0;
  let fallas = 0;
  const asignaturas = est.asignaturas.map((a) => {
    const cerradas = a.periodos.filter((p) => p.periodo <= corte);
    const conNota = cerradas.filter((p) => !p.exento && p.nota !== null);
    const nota = conNota.length === 0 ? null : notaAnual(conNota.map((p) => ({ porcentaje: porcentajeDe.get(p.periodo) ?? 0, nota: p.nota })), decimales);
    const nivel = desempenoDe(nota, datos.escala);
    const primera = conNota[0]?.nota ?? null;
    const ultima = conNota[conNota.length - 1]?.nota ?? null;
    const tendencia = conNota.length < 2 || primera === null || ultima === null ? null : ultima - primera >= 0.3 ? 'SUBE' : ultima - primera <= -0.3 ? 'BAJA' : 'ESTABLE';
    const requerida = notaRequerida(
      a.periodos.map((p) => ({ porcentaje: porcentajeDe.get(p.periodo) ?? 0, nota: p.periodo <= corte ? p.nota : null, exento: p.exento })),
      { ...escala, decimales }
    );
    // Lo que ya está decidido por las notas no se pregunta a la red.
    let p: number | null = null;
    if (requerida.estado === 'APROBADA' || requerida.estado === 'ASEGURADA') p = 0;
    else if (requerida.estado === 'PERDIDA' || requerida.estado === 'NO_ALCANZA') p = 1;
    else if (modelo) {
      const entradas = entradasDeAsignatura(alCorte, a.subject_id);
      p = entradas ? r2(probabilidad(modelo.red, aVector(entradas))) : null;
    }
    const actividades = cerradas.reduce((s, x) => s + x.actividades, 0);
    const noEntregadas = cerradas.reduce((s, x) => s + x.no_entregadas, 0);
    const reg = cerradas.reduce((s, x) => s + x.registros, 0);
    const fal = cerradas.reduce((s, x) => s + x.fallas, 0);
    registros += reg;
    fallas += fal;
    const riesgo = p === null ? null : nivelDeRiesgo(p);
    const foda = fodaDeAsignatura(
      {
        nombre: a.nombre,
        nota,
        nivel: nivel?.nivel ?? null,
        desempeno: nivel?.etiqueta ?? null,
        tendencia,
        actividades,
        no_entregadas: noEntregadas,
        registros: reg,
        fallas: fal,
        nota_requerida: requerida,
        riesgo,
        nota_anio_anterior: notaDelAnioAnterior(anterior, a.subject_id, a.area_id),
      },
      escala.aprobatoria,
      decimales
    );
    return { a, nota, nivel, requerida, p, riesgo, foda, reg, fal };
  });

  const sinDatos = asignaturas.every((x) => x.nota === null) && !anterior;
  const conProbabilidad = asignaturas.filter((x) => x.p !== null);
  let riesgo: RiesgoPromocion | null = null;
  if (conProbabilidad.length > 0) {
    const politica = datosDePolitica(await obtenerPolitica(String(anio._id))) as unknown as PoliticaPromocion;
    const faltas: Record<string, number> = { I: 0, II: 0, III: 0 };
    for (const f of est.faltas) faltas[f.gravedad] = (faltas[f.gravedad] ?? 0) + 1;
    const pct = registros === 0 ? 0 : (fallas / registros) * 100;
    riesgo = riesgoDePromocion(
      conProbabilidad.map((x) => ({
        subject_id: x.a.subject_id,
        area_id: x.a.area_id,
        nombre: x.a.nombre,
        probabilidad: x.p as number,
        inasistencia_total_pct: x.reg === 0 ? 0 : (x.fal / x.reg) * 100,
        inasistencia_injustificada_pct: x.reg === 0 ? 0 : (x.fal / x.reg) * 100,
      })),
      {
        grado_id: est.grado_id,
        nivel: est.nivel,
        escala,
        inasistencia_global_total_pct: pct,
        inasistencia_global_injustificada_pct: pct,
        faltas_por_gravedad: faltas,
        admite_recuperacion_final: datos.admite_recuperacion_final,
        max_recuperables: datos.max_recuperables,
      },
      politica
    );
  }

  const notas = asignaturas.filter((x) => x.nota !== null).map((x) => x.nota as number);
  const promedio = notas.length === 0 ? null : r2(notas.reduce((s, v) => s + v, 0) / notas.length);
  const nivelGeneral = desempenoDe(promedio, datos.escala);
  const perdiendo = asignaturas.filter((x) => x.nota !== null && x.nota < escala.aprobatoria).length;
  const recuperables = asignaturas.filter((x) => (x.riesgo === 'MEDIO' || x.riesgo === 'ALTO') && x.requerida.estado === 'ALCANZABLE').map((x) => x.a.nombre);
  const aseguradas = asignaturas.filter((x) => x.requerida.estado === 'ASEGURADA' || x.requerida.estado === 'APROBADA').map((x) => x.a.nombre);
  const foda = sinDatos
    ? { fortalezas: [], oportunidades: [], debilidades: [], amenazas: [] }
    : fodaGeneral(
        {
          promedio,
          nivel: nivelGeneral?.nivel ?? null,
          desempeno: nivelGeneral?.etiqueta ?? null,
          perdidas: perdiendo,
          registros,
          fallas,
          faltas_graves: est.faltas.filter((f) => f.gravedad !== 'I').length,
          hay_periodos_cerrados: corte > 0,
          riesgo_no_promocion: riesgo?.no_promovido ?? null,
          riesgo_recuperacion: riesgo?.recuperacion ?? null,
        },
        recuperables,
        ve.convivencia,
        aseguradas
      );

  let aviso: string | null = null;
  if (!modelo) aviso = 'Aún no hay un modelo entrenado: se muestran las notas y lo que falta, sin el riesgo estimado.';
  else if (modelo.es_demostracion) aviso = 'Modelo de demostración: todavía no hay suficientes años cerrados en el colegio para entrenarlo con datos propios. Tómalo como orientación.';

  return {
    estudiante: { _id: studentId, nombre: usuario.nombre, apellido: usuario.apellido, grado: est.grado_numero, grupo: est.grupo },
    anio: { _id: String(anio._id), year: anio.year },
    corte,
    total_periodos: n,
    decimales,
    estado: sinDatos ? 'SIN_DATOS' : 'LISTO',
    modelo: { origen: modelo?.origen ?? null, version: modelo?.version ?? null, aviso },
    general: { promedio, desempeno: nivelGeneral?.etiqueta ?? null, nivel: nivelGeneral?.nivel ?? null, asignaturas_perdiendo: perdiendo, ...(ve.probabilidad ? { riesgo } : {}) },
    foda,
    asignaturas: asignaturas.map((x) => ({
      subject_id: x.a.subject_id,
      nombre: x.a.nombre,
      nota: x.nota,
      desempeno: x.nivel?.etiqueta ?? null,
      nivel: x.nivel?.nivel ?? null,
      nota_requerida: x.requerida,
      ...(ve.probabilidad ? { probabilidad: x.p, riesgo: x.riesgo } : {}),
      foda: x.foda,
    })),
    ve,
  };
}

async function analizar(anio: AcademicYearDocument, studentId: string, rol: string): Promise<AnalisisEstudiante | null> {
  const modelo = await modeloEnUso();
  const ve = vistaDelAnalisis(rol);
  return memorizar(`predictivo:${studentId}:${String(anio._id)}:${modelo?.clave ?? 'sin-modelo'}:${ve.probabilidad ? 1 : 0}${ve.convivencia ? 1 : 0}`, TTL_ANALISIS_MS, () =>
    calcular(anio, studentId, modelo, ve)
  );
}

async function auditar(usuario: UserDocument, studentId: string, ip?: string | null) {
  await registrarEvento({ usuario_id: usuario._id, accion: 'PREDICTIVO_ANALISIS_CONSULTADO', entidad: 'User', entidad_id: studentId, ip });
}

export async function analisisParaPersonal(usuario: UserDocument, studentId: string, academicYearId: string | undefined, ip?: string | null) {
  if (!puedePredictivo(usuario.rol, 'BUSCAR_ESTUDIANTES')) throw new ApiError(403, 'No tienes acceso al módulo predictivo.');
  if (!Types.ObjectId.isValid(studentId)) throw new ApiError(404, 'Estudiante no encontrado.');
  const anio = await anioDeTrabajo(academicYearId);
  const analisis = await analizar(anio, studentId, usuario.rol);
  if (!analisis) throw new ApiError(404, 'El estudiante no tiene una matrícula activa con notas en ese año (Preescolar no se analiza).');
  await auditar(usuario, studentId, ip);
  return analisis;
}

/** El estudiante ve el suyo, solo con matrícula activa (condicional o definitiva). */
export async function analisisPropio(usuario: UserDocument, ip?: string | null) {
  if (!puedePredictivo(usuario.rol, 'VER_PROPIO')) throw new ApiError(403, 'Solo el estudiante ve su propio análisis.');
  const anio = await anioDeTrabajo();
  const analisis = await analizar(anio, String(usuario._id), ROLES.ESTUDIANTE);
  if (!analisis) throw new ApiError(409, 'El análisis está disponible solo con una matrícula activa.');
  await auditar(usuario, String(usuario._id), ip);
  return analisis;
}

/** El acudiente ve el de cada hijo vinculado; un estudiante que no es su hijo responde 404 igual que uno que no existe. */
export async function analisisDeHijo(usuario: UserDocument, studentId: string, ip?: string | null) {
  if (!puedePredictivo(usuario.rol, 'VER_HIJOS')) throw new ApiError(403, 'Solo el acudiente ve el análisis de sus hijos.');
  await exigirAcudienteDe(usuario, studentId);
  const anio = await anioDeTrabajo();
  const analisis = await analizar(anio, studentId, ROLES.ACUDIENTE);
  if (!analisis) throw new ApiError(409, 'El análisis está disponible solo con una matrícula activa.');
  await auditar(usuario, studentId, ip);
  return analisis;
}

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Buscador del personal: estudiantes con matrícula activa en el año, por nombre, apellido o documento (mínimo 3 letras). */
export async function buscarEstudiantes(usuario: UserDocument, q: string, academicYearId?: string) {
  if (!puedePredictivo(usuario.rol, 'BUSCAR_ESTUDIANTES')) throw new ApiError(403, 'No tienes acceso al módulo predictivo.');
  const texto = q.trim();
  if (texto.length < 3) return [];
  const anio = await anioDeTrabajo(academicYearId);
  const patron = new RegExp(escaparRegex(texto), 'i');
  const candidatos = await User.find({ roles: ROLES.ESTUDIANTE, $or: [{ nombre: patron }, { apellido: patron }, { numero_documento: patron }] })
    .select('nombre apellido numero_documento')
    .limit(200);
  const matriculas = await Enrollment.find({ academic_year_id: anio._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS }, student_id: { $in: candidatos.map((c) => c._id) } })
    .select('student_id group_id')
    .lean();
  const grupos = new Map((await Group.find({ _id: { $in: matriculas.map((m) => m.group_id) } }).select('nomenclatura').lean()).map((g) => [String(g._id), g.nomenclatura]));
  const grupoDe = new Map(matriculas.map((m) => [String(m.student_id), grupos.get(String(m.group_id)) ?? '']));
  return candidatos
    .filter((c) => grupoDe.has(String(c._id)))
    .slice(0, 30)
    .map((c) => ({ _id: String(c._id), nombre: c.nombre, apellido: c.apellido, numero_documento: c.numero_documento, grupo: grupoDe.get(String(c._id)) ?? '' }))
    .sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es'));
}
