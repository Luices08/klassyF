import { ClientSession, Types } from 'mongoose';
import { generarChecklistDesdeCatalogo } from './requisitoDocumental.service';
import { ESTADOS_MATRICULA_ACTIVOS, ESTADOS_MATRICULA_VIVOS, EstadoDocumentoMatricula, TipoIngreso } from '../constants/enums';
import { ResultadoPromocion } from '../constants/promocion';
import { ROLES } from '../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import ConfirmacionContinuidad from '../models/confirmacionContinuidad.model';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import PazYSalvo from '../models/pazYSalvo.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudentProfile from '../models/studentProfile.model';
import Titulacion from '../models/titulacion.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { destinoDeRollover, DestinoRollover } from '../utils/rollover';
import { GrupoParalelo, edadCumplida, repartirConBalanceo } from '../utils/rematricula';
import { runTransaction } from '../utils/runTransaction';
import { ESTADOS_QUE_EXIGEN_REINGRESO } from '../utils/situacionEstudiante';
import { registrarEvento } from './audit.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { obtenerConfiguracion } from './configuracionRematricula.service';
import { exigirSinMatriculaViva } from './enrollment.service';
import { asegurarConfiguracion as asegurarFoliatura, asignarFolio } from './foliatura.service';
import { aprobarItemConPazYSalvo, pazYSalvoConfirmadoPrevio } from './pazYSalvo.service';
import { DIAS_PLAZO_LEGALIZACION } from '../constants/matriculaChecklist';

/** Consultan coordinación, administración y secretaría (esta solo de sus sedes). */
const PUEDEN_CONSULTAR = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];
/** Ejecutan el paso de año el administrador y la secretaría (esta solo en sus sedes), cada uno con su contraseña. */
const PUEDEN_EJECUTAR = [ROLES.ADMIN, ROLES.SECRETARIA];

/**
 * - POR_CREAR: se matricula directamente en MATRICULADO_DEFINITIVO con Libro y Folio.
 * - YA_TIENE_MATRICULA: ya tiene matrícula activa en el año siguiente (no se duplica).
 * - SIN_CUPO: los grupos del grado destino no tienen aforo suficiente (alerta para Rectoría).
 * - SIN_CONFIRMAR: la familia no respondió si continúa (cuando el modo es CONFIRMADOS).
 * - NO_APLICA: no aplica para matrícula directa (ej. PENDIENTE_RECUPERACION, retirado, o no continúa).
 */
export type EstadoFilaRollover = 'POR_CREAR' | 'YA_TIENE_MATRICULA' | 'SIN_CUPO' | 'SIN_CONFIRMAR' | 'NO_APLICA';

export type ModoContinuidad = 'CONFIRMADOS' | 'TODOS';

export interface FiltrosRollover {
  origen_id: string;
  destino_id: string;
  sede_id?: string;
  grade_id?: string;
  group_id?: string;
  continuidad?: ModoContinuidad;
}

export interface FilaRollover {
  student_id: string;
  enrollment_id: string;
  estudiante: { nombre: string; apellido: string; numero_documento: string };
  grupo_origen: string;
  resultado: ResultadoPromocion | null;
  destino: DestinoRollover;
  estado: EstadoFilaRollover;
  motivo: string;
  tipo_ingreso: TipoIngreso | null;
  grupo_destino_id: string | null;
  grupo_destino: string | null;
  sede_id: string | null;
  jornada_id: string | null;
  grado_destino_id: string | null;
  paz_y_salvo: 'CONFIRMADO' | 'PENDIENTE';
}

export interface GrupoDestinoPlan {
  id: string;
  nombre: string;
  capacidad: number;
  ocupados_antes: number;
  asignados: number;
  libres_despues: number;
}

export interface PlanRollover {
  origen: { id: string; year: number };
  destino: { id: string; year: number };
  filas: FilaRollover[];
  modo_continuidad: ModoContinuidad;
  grupos_destino: GrupoDestinoPlan[];
  alertas: string[];
  retirados: number;
  resumen: {
    total: number;
    por_crear: number;
    ya_tienen_matricula: number;
    sin_cupo: number;
    sin_confirmar: number;
    no_aplica: number;
    por_destino: Partial<Record<DestinoRollover, number>>;
  };
}

function exigirConsulta(usuario: UserDocument): void {
  if (!PUEDEN_CONSULTAR.includes(usuario.rol)) throw new ApiError(403, 'Solo coordinación, secretaría y el administrador consultan el paso de año.');
}

function alcanceDeSedes(usuario: UserDocument): 'TODAS' | string[] {
  return usuario.rol === ROLES.SECRETARIA ? usuario.sedes_ids.map(String) : 'TODAS';
}

async function cargarAnios(f: FiltrosRollover): Promise<{ origen: AcademicYearDocument; destino: AcademicYearDocument }> {
  const [origen, destino] = await Promise.all([cargarAnio(f.origen_id), cargarAnio(f.destino_id)]);
  if (String(origen._id) === String(destino._id)) throw new ApiError(400, 'El año de origen y el de destino son el mismo.');
  if (destino.year <= origen.year) throw new ApiError(409, `El año de destino (${destino.year}) debe ser posterior al de origen (${origen.year}).`);
  if (destino.estado === 'CERRADO') throw new ApiError(409, `El año ${destino.year} ya está cerrado: no admite matrículas.`);
  return { origen, destino };
}

/** Lo que el cierre de M19 congeló del año (promedio, faltas, PIAR) vive en `entrada`; `detalle` es la explicación del resultado. */
function cierreEntrada(cierre: { entrada?: unknown } | null | undefined): { promedio_general?: number | null; tiene_piar?: boolean } {
  if (!cierre?.entrada || typeof cierre.entrada !== 'object') return {};
  return cierre.entrada as { promedio_general?: number | null; tiene_piar?: boolean };
}

async function planificar(f: FiltrosRollover, alcance: 'TODAS' | string[]): Promise<PlanRollover> {
  const { origen, destino } = await cargarAnios(f);
  const config = await obtenerConfiguracion();

  const queryGruposOrigen: Record<string, unknown> = { academic_year_id: origen._id };
  if (alcance !== 'TODAS') queryGruposOrigen.sede_id = { $in: alcance };
  if (f.sede_id) queryGruposOrigen.sede_id = f.sede_id;
  if (f.grade_id) queryGruposOrigen.grade_id = f.grade_id;
  if (f.group_id) queryGruposOrigen._id = f.group_id;

  const gruposOrigen = await Group.find(queryGruposOrigen).select('_id grade_id sede_id jornada_id nomenclatura').lean();
  const gruposOrigenIds = gruposOrigen.map((g) => g._id);

  const queryGruposDestino: Record<string, unknown> = { academic_year_id: destino._id, estado: 'ACTIVE' };
  if (alcance !== 'TODAS') queryGruposDestino.sede_id = { $in: alcance };
  if (f.sede_id) queryGruposDestino.sede_id = f.sede_id;
  const gruposDestino = await Group.find(queryGruposDestino).select('_id grade_id sede_id jornada_id nomenclatura max_capacity cupos_ocupados').lean();

  const [matriculasOrigen, matriculasDestino, grados, confirmaciones] = await Promise.all([
    Enrollment.find({ group_id: { $in: gruposOrigenIds } }).lean(),
    Enrollment.find({ academic_year_id: destino._id, estado: { $in: ESTADOS_MATRICULA_VIVOS } }).select('student_id group_id tipo_ingreso').lean(),
    Grade.find().select('_id nombre numero nivel').lean(),
    ConfirmacionContinuidad.find({ academic_year_id: destino._id }).select('student_id decision').lean(),
  ]);

  const pazConfirmado = await pazYSalvoConfirmados(
    matriculasOrigen.map((m) => m.student_id),
    destino.year
  );

  const matriculadosDestino = new Set(matriculasDestino.map((m) => String(m.student_id)));
  const continuidadPorId = new Map(confirmaciones.map((c) => [String(c.student_id), c.decision]));

  const activosOrigen = matriculasOrigen.filter((m) => ESTADOS_MATRICULA_ACTIVOS.includes(m.estado));
  const retirados = matriculasOrigen.length - activosOrigen.length;

  const estudiantesIds = activosOrigen.map((m) => m.student_id);
  const [usuarios, perfiles, cierres, graduaciones] = await Promise.all([
    User.find({ _id: { $in: estudiantesIds } }).select('_id nombre apellido numero_documento estado').lean(),
    StudentProfile.find({ user_id: { $in: estudiantesIds } }).select('user_id fecha_nacimiento estado').lean(),
    EvaluacionPromocion.find({ academic_year_id: origen._id, student_id: { $in: estudiantesIds }, vigente: true }).lean(),
    Titulacion.find({ academic_year_id: origen._id, student_id: { $in: estudiantesIds }, estado: { $in: ['GRADUADO', 'GRADUADO_EXTEMPORANEO'] } }).select('student_id').lean(),
  ]);

  const usuarioPorId = new Map(usuarios.map((u) => [String(u._id), u]));
  const perfilPorId = new Map(perfiles.map((p) => [String(p.user_id), p]));
  const graduadosIds = new Set(graduaciones.map((g) => String(g.student_id)));

  const cierrePorId = new Map(cierres.map((c) => [String(c.student_id), c]));

  const grupoPorId = new Map(gruposOrigen.map((g) => [String(g._id), g]));
  const gradoPorId = new Map(grados.map((g) => [String(g._id), g]));
  const gradoPorNumero = new Map(grados.map((g) => [g.numero, g]));

  // Quien continúa lo dice la familia (o secretaría por ella): sin indicarlo, solo se matricula a quienes confirmaron.
  const modoContinuidad: ModoContinuidad = f.continuidad ?? 'CONFIRMADOS';

  const ordenadas = [...activosOrigen].sort((a, b) => {
    const ua = usuarioPorId.get(String(a.student_id));
    const ub = usuarioPorId.get(String(b.student_id));
    return (ua?.apellido ?? '').localeCompare(ub?.apellido ?? '', 'es') || (ua?.nombre ?? '').localeCompare(ub?.nombre ?? '', 'es');
  });

  const nombreGrupo = (g: { nomenclatura: string; grade_id: Types.ObjectId }) => `${gradoPorId.get(String(g.grade_id))?.nombre ?? ''} ${g.nomenclatura}`.trim();

  interface Intermedia {
    fila: FilaRollover;
    gradoDestinoId: string | null;
    sedeId: string;
    jornadaId: string | null;
    repitente: boolean;
    piar: boolean;
    edad: number | null;
  }

  const intermedias: Intermedia[] = ordenadas.map((m) => {
    const sid = String(m.student_id);
    const origenGrupo = grupoPorId.get(String(m.group_id))!;
    const gradoOrigen = gradoPorId.get(String(origenGrupo.grade_id));
    const u = usuarioPorId.get(sid);
    const cierre = cierrePorId.get(sid);
    const siguiente = gradoOrigen ? gradoPorNumero.get(gradoOrigen.numero + 1) : undefined;

    const { destino: dest, motivo } = destinoDeRollover({
      resultado: cierre?.resultado ?? null,
      no_renueva_cupo: Boolean((cierre?.detalle as { no_renueva_cupo?: boolean } | undefined)?.no_renueva_cupo),
      hay_grado_siguiente: Boolean(siguiente),
      graduado: graduadosIds.has(sid),
    });

    const base: FilaRollover = {
      student_id: sid,
      enrollment_id: String(m._id),
      estudiante: { nombre: u?.nombre ?? '', apellido: u?.apellido ?? '', numero_documento: u?.numero_documento ?? '' },
      grupo_origen: nombreGrupo(origenGrupo),
      resultado: cierre?.resultado ?? null,
      destino: dest,
      estado: 'NO_APLICA',
      motivo,
      tipo_ingreso: null,
      grupo_destino_id: null,
      grupo_destino: null,
      sede_id: null,
      jornada_id: null,
      grado_destino_id: null,
      paz_y_salvo: pazConfirmado.has(sid) ? 'CONFIRMADO' : 'PENDIENTE',
    };

    // Estudiantes pendientes de nivelación en M18 NO se matriculan todavía
    if (cierre?.resultado === 'PENDIENTE_RECUPERACION') {
      return {
        fila: { ...base, estado: 'NO_APLICA', motivo: 'Pendiente de nivelaciones de fin de año en M18: se definirá tras el registro docente.' },
        gradoDestinoId: null,
        sedeId: '',
        jornadaId: null,
        repitente: false,
        piar: false,
        edad: null,
      };
    }

    const colocable = dest === 'GRADO_SIGUIENTE' || dest === 'MISMO_GRADO';
    if (colocable && u && u.estado !== 'activo') {
      return { fila: { ...base, motivo: 'El usuario del estudiante está inactivo.' }, gradoDestinoId: null, sedeId: '', jornadaId: null, repitente: false, piar: false, edad: null };
    }
    if (colocable && matriculadosDestino.has(sid)) {
      return { fila: { ...base, estado: 'YA_TIENE_MATRICULA', motivo: `Ya tiene matrícula en ${destino.year}.` }, gradoDestinoId: null, sedeId: '', jornadaId: null, repitente: false, piar: false, edad: null };
    }
    if (colocable && modoContinuidad === 'CONFIRMADOS') {
      const respuesta = continuidadPorId.get(sid);
      if (respuesta === 'NO_CONTINUA') {
        return { fila: { ...base, motivo: 'La familia informó que no continúa el año siguiente.' }, gradoDestinoId: null, sedeId: '', jornadaId: null, repitente: false, piar: false, edad: null };
      }
      if (!respuesta) {
        return { fila: { ...base, estado: 'SIN_CONFIRMAR', motivo: 'La familia no ha confirmado continuidad (se puede incluir eligiendo «todos»).' }, gradoDestinoId: null, sedeId: '', jornadaId: null, repitente: false, piar: false, edad: null };
      }
    }
    const perfil = perfilPorId.get(sid);
    if (colocable && perfil?.estado && ESTADOS_QUE_EXIGEN_REINGRESO.includes(perfil.estado)) {
      return { fila: { ...base, motivo: `Su expediente figura ${perfil.estado}: el regreso requiere confirmación de reingreso.` }, gradoDestinoId: null, sedeId: '', jornadaId: null, repitente: false, piar: false, edad: null };
    }
    if (!colocable) {
      return { fila: base, gradoDestinoId: null, sedeId: '', jornadaId: null, repitente: false, piar: false, edad: null };
    }

    const gradoDestino = dest === 'GRADO_SIGUIENTE' ? siguiente : gradoOrigen;
    const entrada = cierreEntrada(cierre);

    return {
      fila: {
        ...base,
        estado: 'POR_CREAR',
        tipo_ingreso: dest === 'MISMO_GRADO' ? 'REPITENTE' : 'ANTIGUO',
        sede_id: String(origenGrupo.sede_id),
        jornada_id: origenGrupo.jornada_id ? String(origenGrupo.jornada_id) : null,
        grado_destino_id: gradoDestino ? String(gradoDestino._id) : null,
      },
      gradoDestinoId: gradoDestino ? String(gradoDestino._id) : null,
      sedeId: String(origenGrupo.sede_id),
      jornadaId: origenGrupo.jornada_id ? String(origenGrupo.jornada_id) : null,
      repitente: dest === 'MISMO_GRADO',
      piar: Boolean(entrada.tiene_piar),
      edad: edadCumplida(perfil?.fecha_nacimiento, destino.fecha_inicio),
    };
  });

  const porCrear = intermedias.filter((i) => i.fila.estado === 'POR_CREAR');
  const cohortes = new Map<string, Intermedia[]>();
  for (const i of porCrear) {
    const clave = `${i.sedeId}|${i.gradoDestinoId}`;
    cohortes.set(clave, [...(cohortes.get(clave) ?? []), i]);
  }

  const gruposDestinoPorId = new Map(gruposDestino.map((g) => [String(g._id), g]));
  const gruposDelPlan: GrupoDestinoPlan[] = [];
  const alertas: string[] = [];

  for (const [clave, miembros] of cohortes) {
    const [sedeId, gradoId] = clave.split('|') as [string, string];
    const paralelos = gruposDestino.filter((g) => String(g.sede_id) === sedeId && String(g.grade_id) === gradoId);
    const gradoNombre = gradoPorId.get(gradoId)?.nombre ?? 'el grado';

    if (paralelos.length === 0) {
      for (const i of miembros) {
        i.fila.estado = 'SIN_CUPO';
        i.fila.motivo = 'No hay grupos creados de este grado en el año siguiente para esta sede.';
      }
      alertas.push(`${gradoNombre}: no hay grupos creados en el año siguiente en la sede; ${miembros.length} estudiante(s) sin cupo.`);
      continue;
    }

    const iniciales: GrupoParalelo[] = paralelos.map((g) => ({
      id: String(g._id),
      nomenclatura: g.nomenclatura,
      jornada_id: g.jornada_id ? String(g.jornada_id) : null,
      capacidad: g.max_capacity,
      ocupados: g.cupos_ocupados,
      repitentes: 0,
      con_piar: 0,
      edades: [],
    }));

    const { asignado, grupos: finales } = repartirConBalanceo(
      miembros.map((i) => ({
        id: i.fila.student_id,
        jornada_id: i.jornadaId,
        repitente: i.repitente,
        piar: i.piar,
        edad: i.edad,
      })),
      iniciales,
      config.tolerancia_ocupacion_pct
    );

    let sinLugar = 0;
    for (const i of miembros) {
      const gid = asignado.get(i.fila.student_id) ?? null;
      if (gid) {
        i.fila.grupo_destino_id = gid;
        i.fila.grupo_destino = nombreGrupo(gruposDestinoPorId.get(gid)!);
      } else {
        sinLugar += 1;
        i.fila.estado = 'SIN_CUPO';
        i.fila.motivo = `Aforo máximo alcanzado en los salones de ${gradoNombre}. Rectoría debe ampliar el cupo del grupo o habilitar un paralelo.`;
      }
    }

    if (sinLugar > 0) {
      alertas.push(`${gradoNombre}: Capacidad insuficiente. Faltan ${sinLugar} cupo(s) para los estudiantes antiguos. Amplía el aforo o crea un paralelo antes de ejecutar.`);
    }

    for (const antes of iniciales) {
      const despues = finales.find((g) => g.id === antes.id)!;
      gruposDelPlan.push({
        id: antes.id,
        nombre: nombreGrupo(gruposDestinoPorId.get(antes.id)!),
        capacidad: antes.capacidad,
        ocupados_antes: antes.ocupados,
        asignados: despues.ocupados - antes.ocupados,
        libres_despues: Math.max(0, despues.capacidad - despues.ocupados),
      });
    }
  }

  const filas = intermedias.map((i) => i.fila);
  const pendientesM18 = filas.filter((x) => x.resultado === 'PENDIENTE_RECUPERACION').length;
  if (pendientesM18 > 0) {
    alertas.push(`${pendientesM18} estudiante(s) esperan resolución de recuperaciones (M18) y no se proyectan todavía.`);
  }

  const por_destino: Partial<Record<DestinoRollover, number>> = {};
  for (const fila of filas) por_destino[fila.destino] = (por_destino[fila.destino] ?? 0) + 1;
  const cuenta = (estado: EstadoFilaRollover) => filas.filter((x) => x.estado === estado).length;

  return {
    origen: { id: String(origen._id), year: origen.year },
    destino: { id: String(destino._id), year: destino.year },
    filas,
    modo_continuidad: modoContinuidad,
    grupos_destino: gruposDelPlan,
    alertas,
    retirados,
    resumen: {
      total: filas.length,
      por_crear: cuenta('POR_CREAR'),
      ya_tienen_matricula: cuenta('YA_TIENE_MATRICULA'),
      sin_cupo: cuenta('SIN_CUPO'),
      sin_confirmar: cuenta('SIN_CONFIRMAR'),
      no_aplica: cuenta('NO_APLICA'),
      por_destino,
    },
  };
}

async function pazYSalvoConfirmados(estudiantesIds: Types.ObjectId[], anioDestino: number): Promise<Set<string>> {
  const confirmados = await PazYSalvo.find({ student_id: { $in: estudiantesIds }, estado: 'CONFIRMADO' }).select('student_id academic_year_id');
  if (confirmados.length === 0) return new Set();
  const anios = await AcademicYear.find({ _id: { $in: confirmados.map((c) => c.academic_year_id) }, year: { $lt: anioDestino } }).select('_id');
  const validos = new Set(anios.map((a) => String(a._id)));
  return new Set(confirmados.filter((c) => validos.has(String(c.academic_year_id))).map((c) => String(c.student_id)));
}

function alcanceParaConsulta(f: FiltrosRollover, usuario: UserDocument): 'TODAS' | string[] {
  const alcance = alcanceDeSedes(usuario);
  if (alcance !== 'TODAS' && f.sede_id && !alcance.includes(f.sede_id)) throw new ApiError(403, 'Esa sede no está entre las que tienes asignadas.');
  return alcance;
}

export async function simularRollover(f: FiltrosRollover, usuario: UserDocument): Promise<PlanRollover> {
  exigirConsulta(usuario);
  return planificar(f, alcanceParaConsulta(f, usuario));
}

/** Plazo para entregar el paz y salvo: desde que arranca el año siguiente (o desde hoy, si ya arrancó), los días que el colegio da de partida. */
function plazoDeLegalizacion(destino: AcademicYearDocument): Date {
  const base = Math.max(destino.fecha_inicio.getTime(), Date.now());
  return new Date(new Date(base + DIAS_PLAZO_LEGALIZACION * 86_400_000).toISOString().slice(0, 10));
}

export interface DatosMatriculaRollover {
  student_id: string;
  tipo_ingreso: TipoIngreso;
  grupo_destino_id: string;
  grupo_origen: string;
  grupo_destino: string;
}

/**
 * Formaliza directamente la matrícula para estudiantes antiguos (promovidos o repitentes):
 * Asigna nuevo Libro y Folio del año destino y genera el checklist con los documentos ya en archivo aprobados.
 * Nace MATRICULADO_DEFINITIVO si el paz y salvo del año que termina está confirmado, y MATRICULADO_CONDICIONAL (con plazo) si no.
 */
export async function crearMatriculaRollover(fila: DatosMatriculaRollover, destino: AcademicYearDocument, session: ClientSession): Promise<Types.ObjectId> {
  await exigirSinMatriculaViva(fila.student_id, destino._id, session);

  const grupo = await Group.findOneAndUpdate(
    { _id: fila.grupo_destino_id, academic_year_id: destino._id, estado: 'ACTIVE', $expr: { $lt: ['$cupos_ocupados', '$max_capacity'] } },
    { $inc: { cupos_ocupados: 1 } },
    { new: true, session }
  );
  if (!grupo) throw new ApiError(409, 'El grupo ya no tiene cupos disponibles.');

  const grado = await Grade.findById(grupo.grade_id).session(session);
  if (!grado) throw new ApiError(404, 'Grado no encontrado.');

  const [perfil, vinculo] = await Promise.all([
    StudentProfile.findOne({ user_id: fila.student_id }).session(session),
    StudentGuardian.findOne({ student_id: fila.student_id, es_principal: true }).session(session),
  ]);

  const itemsCatalogo = await generarChecklistDesdeCatalogo({
    nivel: grado.nivel,
    numeroGrado: grado.numero,
    tipoIngreso: fila.tipo_ingreso,
    tieneDiscapacidad: perfil?.tiene_discapacidad,
    parentescoAcudiente: vinculo?.parentesco,
  });

  // Los estudiantes antiguos ya tienen sus documentos en el archivo del colegio; se asientan aprobados, salvo el paz y salvo del año que termina:
  // ese es el candado de la matrícula definitiva y solo se aprueba si ya está confirmado.
  const checklist = itemsCatalogo.map((item) => ({
    tipo_documento: item.tipo_documento,
    nombre_personalizado: item.nombre_personalizado ?? null,
    indicacion: item.indicacion ?? null,
    categoria: item.categoria ?? null,
    obligatorio: item.obligatorio,
    estado: (item.tipo_documento === 'PAZ_Y_SALVO_ANIO_ANTERIOR' ? 'PENDIENTE' : 'APROBADO') as EstadoDocumentoMatricula,
    archivo_path: null,
    comentario: null,
    fecha_carga: item.tipo_documento === 'PAZ_Y_SALVO_ANIO_ANTERIOR' ? null : new Date(),
    revisado_por: null,
  }));
  const itemPazYSalvo = checklist.find((c) => c.tipo_documento === 'PAZ_Y_SALVO_ANIO_ANTERIOR');
  if (itemPazYSalvo) {
    const previo = await pazYSalvoConfirmadoPrevio(fila.student_id, destino.year);
    if (previo) aprobarItemConPazYSalvo(itemPazYSalvo, previo);
  }
  const pazPendiente = Boolean(itemPazYSalvo && itemPazYSalvo.estado !== 'APROBADO');

  const { numero_libro, numero_folio, folio_matricula } = await asignarFolio(destino.year, session);

  const [matricula] = await Enrollment.create(
    [
      {
        student_id: fila.student_id,
        group_id: grupo._id,
        academic_year_id: destino._id,
        tipo_ingreso: fila.tipo_ingreso,
        estado: pazPendiente ? 'MATRICULADO_CONDICIONAL' : 'MATRICULADO_DEFINITIVO',
        numero_libro,
        numero_folio,
        folio_matricula,
        fecha_matricula: new Date(),
        ...(pazPendiente ? { fecha_limite_compromiso: plazoDeLegalizacion(destino) } : {}),
        checklist,
      },
    ],
    { session }
  );

  if (!matricula) throw new ApiError(500, 'No se pudo asentar la matrícula en el sistema.');
  return matricula._id;
}

export interface ResultadoRollover {
  creadas: number;
  plan: PlanRollover['resumen'];
}

export async function ejecutarRollover(f: FiltrosRollover, contrasena: string, usuario: UserDocument, ip?: string | null): Promise<ResultadoRollover> {
  if (!PUEDEN_EJECUTAR.includes(usuario.rol)) throw new ApiError(403, 'Solo el administrador y la secretaría formalizan el paso de año.');
  const alcance = alcanceParaConsulta(f, usuario);
  const quien = await User.findById(usuario._id).select('+password_hash');
  if (!quien || !(await quien.comparePassword(contrasena))) throw new ApiError(401, 'Contraseña incorrecta.');

  const plan = await planificar(f, alcance);
  const destino = await cargarAnio(f.destino_id);
  // Antes de abrir la transacción: crearla dentro de ella choca entre dos primeras matrículas y la lectura transaccional no la vería.
  await asegurarFoliatura();
  const porCrear = plan.filas.filter((x) => x.estado === 'POR_CREAR');

  let creadas: Array<{ fila: FilaRollover; matriculaId: Types.ObjectId }> = [];
  await runTransaction(async (session) => {
    creadas = [];
    for (const fila of porCrear) {
      const matriculaId = await crearMatriculaRollover(
        {
          student_id: fila.student_id,
          tipo_ingreso: fila.tipo_ingreso as TipoIngreso,
          grupo_destino_id: fila.grupo_destino_id as string,
          grupo_origen: fila.grupo_origen,
          grupo_destino: fila.grupo_destino as string,
        },
        destino,
        session
      );
      creadas.push({ fila, matriculaId });
    }
  });

  for (const { fila, matriculaId } of creadas) {
    await registrarEvento({
      usuario_id: usuario._id,
      accion: 'MATRICULA_CREADA',
      entidad: 'Enrollment',
      entidad_id: matriculaId,
      detalle: `Paso de año automático (${fila.tipo_ingreso}): ${fila.grupo_origen} -> ${fila.grupo_destino}`,
    });
  }

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'PROMOCION_ROLLOVER_EJECUTADO',
    entidad: 'AcademicYear',
    entidad_id: destino._id,
    detalle: `${plan.origen.year} -> ${plan.destino.year}: ${creadas.length} matrícula(s) definitivas asentadas, ${plan.resumen.sin_cupo} sin cupo por aforo`,
    ip,
  });

  return { creadas: creadas.length, plan: plan.resumen };
}
