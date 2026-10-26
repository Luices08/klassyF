import { ClientSession, Types } from 'mongoose';
import { DIAS_PLAZO_LEGALIZACION } from '../constants/matriculaChecklist';
import { generarChecklistDesdeCatalogo } from './requisitoDocumental.service';
import { ESTADOS_MATRICULA_ACTIVOS, ESTADOS_MATRICULA_VIVOS, EstadoDocumentoMatricula, TipoIngreso } from '../constants/enums';
import { ResultadoPromocion } from '../constants/promocion';
import { ROLES } from '../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import ConfiguracionPrematricula from '../models/configuracionPrematricula.model';
import ConfirmacionContinuidad from '../models/confirmacionContinuidad.model';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import ListaEsperaRematricula from '../models/listaEsperaRematricula.model';
import PazYSalvo from '../models/pazYSalvo.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudentProfile from '../models/studentProfile.model';
import Titulacion from '../models/titulacion.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { destinoDeRollover, DestinoRollover } from '../utils/rollover';
import { DatosDePrioridad, GrupoParalelo, edadCumplida, ordenarPorPrioridad, repartirConBalanceo } from '../utils/rematricula';
import { runTransaction } from '../utils/runTransaction';
import { ESTADOS_QUE_EXIGEN_REINGRESO } from '../utils/situacionEstudiante';
import { registrarEvento } from './audit.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { datosDeConfiguracion, obtenerConfiguracion } from './configuracionRematricula.service';
import { exigirSinMatriculaViva } from './enrollment.service';
import { aprobarItemConPazYSalvo, pazYSalvoConfirmadoPrevio } from './pazYSalvo.service';

/** Consultan coordinación, administración y secretaría (esta solo de sus sedes). */
const PUEDEN_CONSULTAR = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];
/** Reservan los cupos el administrador y la secretaría (esta solo en sus sedes), cada uno con su contraseña. */
const PUEDEN_EJECUTAR = [ROLES.ADMIN, ROLES.SECRETARIA];

/**
 * - POR_CREAR: se le reserva cupo con una pre-matrícula.
 * - YA_TIENE_MATRICULA: ya tiene matrícula viva en el año siguiente (el rollover se puede repetir sin duplicar).
 * - EN_ESPERA: le corresponde un grado con grupos, pero los cupos se agotaron con quienes tienen más prioridad: pasa a la lista de espera.
 * - SIN_CUPO: le corresponde un grado, pero su sede no tiene ningún grupo de ese grado en el año siguiente.
 * - SIN_CONFIRMAR: la familia no respondió si continúa y el proceso es solo con confirmados (ver `ModoContinuidad`): no se pre-matricula.
 * - NO_APLICA: no se pre-matricula (ver `destino` y `motivo`; incluye a quien la familia dijo que no continúa).
 */
export type EstadoFilaRollover = 'POR_CREAR' | 'YA_TIENE_MATRICULA' | 'EN_ESPERA' | 'SIN_CUPO' | 'SIN_CONFIRMAR' | 'NO_APLICA';

/**
 * A quién se pre-matricula: `CONFIRMADOS` solo a quien la familia dijo que continúa (M04, continuidad); `TODOS` a todos los que su cierre de promoción deja
 * seguir. Sin indicarlo, rige `CONFIRMADOS` si el colegio configuró la ventana de prematrícula del año de destino (usa la renovación) y `TODOS` si no.
 */
export type ModoContinuidad = 'CONFIRMADOS' | 'TODOS';

export interface FiltrosRollover {
  origen_id: string;
  destino_id: string;
  sede_id?: string;
  grade_id?: string;
  /** Un solo grupo de origen; sin él se procesa la sede y el grado elegidos (o toda la institución). */
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
  /** Dónde y en qué grado se le busca cupo (solo para quien se puede colocar). */
  sede_id: string | null;
  jornada_id: string | null;
  grado_destino_id: string | null;
  /** Lugar en la lista de espera de su sede y grado (solo si `estado` es EN_ESPERA). */
  posicion_espera: number | null;
  /** Si el paz y salvo del año que termina ya está confirmado, el documento de la pre-matrícula nace aprobado; si no, queda pendiente. */
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
  /** El modo con el que se calculó (el pedido o el que corresponde al colegio). */
  modo_continuidad: ModoContinuidad;
  /** Cómo quedarían los grupos del año siguiente que reciben estudiantes de este alcance. */
  grupos_destino: GrupoDestinoPlan[];
  alertas: string[];
  /** Estudiantes retirados o anulados del año que termina: no se pre-matriculan. */
  retirados: number;
  resumen: { total: number; por_crear: number; ya_tienen_matricula: number; en_espera: number; sin_cupo: number; sin_confirmar: number; no_aplica: number; por_destino: Partial<Record<DestinoRollover, number>> };
}

function exigirConsulta(usuario: UserDocument): void {
  if (!PUEDEN_CONSULTAR.includes(usuario.rol)) throw new ApiError(403, 'Solo coordinación, secretaría y el administrador consultan el paso de año.');
}

/** Las sedes que puede procesar quien consulta: la secretaría solo las suyas (sin sedes no ve nada), los demás todas. */
function alcanceDeSedes(usuario: UserDocument): 'TODAS' | string[] {
  return usuario.rol === ROLES.SECRETARIA ? usuario.sedes_ids.map(String) : 'TODAS';
}

async function cargarAnios(f: FiltrosRollover): Promise<{ origen: AcademicYearDocument; destino: AcademicYearDocument }> {
  const [origen, destino] = await Promise.all([cargarAnio(f.origen_id), cargarAnio(f.destino_id)]);
  if (String(origen._id) === String(destino._id)) throw new ApiError(400, 'El año de origen y el de destino son el mismo.');
  if (destino.year <= origen.year) throw new ApiError(409, `El año de destino (${destino.year}) debe ser posterior al de origen (${origen.year}).`);
  if (destino.estado === 'CERRADO') throw new ApiError(409, `El año ${destino.year} ya está cerrado: no admite pre-matrículas.`);
  return { origen, destino };
}

const cierreEntrada = (cierre: { entrada?: unknown } | undefined) =>
  (cierre?.entrada ?? {}) as { promedio_general?: number | null; faltas_por_gravedad?: Record<string, number>; tiene_piar?: boolean };

/**
 * Calcula, sin escribir nada, a quién se le reserva cupo en el año siguiente y dónde. Solo LEE el cierre de promoción de M19 (resultado,
 * promedio, «no renueva cupo», faltas y PIAR del año, ya congelados allí: no se consulta convivencia ni inclusión); no decide nada
 * académico. Si los cupos no alcanzan, la prioridad la fija la configuración del colegio (`ConfiguracionRematricula`) y quien queda sin
 * lugar va a la lista de espera. El reparto entre grupos paralelos balancea ocupación, repitentes, PIAR y edades. Es determinista: la
 * simulación y la ejecución dan lo mismo.
 */
export async function planificar(f: FiltrosRollover, alcance: 'TODAS' | string[] = 'TODAS'): Promise<PlanRollover> {
  const { origen, destino } = await cargarAnios(f);
  const config = datosDeConfiguracion(await obtenerConfiguracion());
  const modoContinuidad: ModoContinuidad = f.continuidad ?? ((await ConfiguracionPrematricula.exists({ academic_year_id: destino._id })) ? 'CONFIRMADOS' : 'TODOS');

  const [matriculas, grupos, grados] = await Promise.all([
    Enrollment.find({ academic_year_id: origen._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }),
    Group.find({ academic_year_id: origen._id }),
    Grade.find(),
  ]);
  const grupoPorId = new Map(grupos.map((g) => [String(g._id), g]));
  const gradoPorId = new Map(grados.map((g) => [String(g._id), g]));
  const gradoPorNumero = new Map(grados.filter((g) => g.estado !== 'inactivo').map((g) => [g.numero, g]));

  if (f.group_id) {
    const elegido = grupoPorId.get(f.group_id);
    if (!elegido) throw new ApiError(404, 'El grupo de origen no existe en el año que termina.');
    if ((f.sede_id && String(elegido.sede_id) !== f.sede_id) || (f.grade_id && String(elegido.grade_id) !== f.grade_id)) {
      throw new ApiError(400, 'El grupo elegido no pertenece a la sede o al grado indicados.');
    }
  }

  const delAlcance = matriculas.filter((m) => {
    const g = grupoPorId.get(String(m.group_id));
    if (!g) return false;
    if (alcance !== 'TODAS' && !alcance.includes(String(g.sede_id))) return false;
    if (f.group_id && String(g._id) !== f.group_id) return false;
    if (f.sede_id && String(g.sede_id) !== f.sede_id) return false;
    if (f.grade_id && String(g.grade_id) !== f.grade_id) return false;
    return true;
  });
  const estudiantesIds = delAlcance.map((m) => m.student_id);

  // Cupos del año siguiente por grupo y lo que ya tienen (de etapas anteriores), para balancear lo que falta.
  const gruposDestino = await Group.find({ academic_year_id: destino._id, estado: 'ACTIVE' });
  const matriculasDestino = await Enrollment.find({ academic_year_id: destino._id, group_id: { $in: gruposDestino.map((g) => g._id) }, estado: { $in: ESTADOS_MATRICULA_VIVOS } }).select('student_id group_id tipo_ingreso');
  const yaEnDestinoIds = matriculasDestino.map((m) => m.student_id);

  const [usuarios, perfiles, cierres, yaMatriculados, retiradosIds, pazConfirmado, graduados, historial, cierresDeDestino, respuestasContinuidad] = await Promise.all([
    User.find({ _id: { $in: estudiantesIds } }).select('nombre apellido numero_documento estado'),
    StudentProfile.find({ user_id: { $in: [...estudiantesIds, ...yaEnDestinoIds] } }).select('user_id estado fecha_nacimiento'),
    EvaluacionPromocion.find({ academic_year_id: origen._id, student_id: { $in: estudiantesIds }, vigente: true }),
    Enrollment.distinct('student_id', { academic_year_id: destino._id, student_id: { $in: estudiantesIds }, estado: { $nin: ['RETIRADO', 'ANULADO'] } }),
    Enrollment.distinct('student_id', { academic_year_id: origen._id, estado: { $in: ['RETIRADO', 'ANULADO'] } }),
    pazYSalvoConfirmados(estudiantesIds, destino.year),
    Titulacion.find({ academic_year_id: origen._id, student_id: { $in: estudiantesIds }, estado: { $in: ['GRADUADO', 'GRADUADO_EXTEMPORANEO'] } }).select('student_id'),
    Enrollment.find({ student_id: { $in: estudiantesIds }, estado: { $ne: 'ANULADO' }, academic_year_id: { $ne: destino._id } }).select('student_id academic_year_id'),
    EvaluacionPromocion.find({ academic_year_id: origen._id, student_id: { $in: yaEnDestinoIds }, vigente: true }).select('student_id entrada'),
    ConfirmacionContinuidad.find({ academic_year_id: destino._id, student_id: { $in: estudiantesIds } }).select('student_id decision'),
  ]);
  const continuidadPorId = new Map(respuestasContinuidad.map((r) => [String(r.student_id), r.decision]));
  const usuarioPorId = new Map(usuarios.map((u) => [String(u._id), u]));
  const perfilPorId = new Map(perfiles.map((p) => [String(p.user_id), p]));
  const cierrePorId = new Map(cierres.map((c) => [String(c.student_id), c]));
  const matriculadosDestino = new Set(yaMatriculados.map(String));
  const graduadosIds = new Set(graduados.map((t) => String(t.student_id)));
  const aniosPorEstudiante = new Map<string, Set<string>>();
  for (const h of historial) {
    const id = String(h.student_id);
    aniosPorEstudiante.set(id, (aniosPorEstudiante.get(id) ?? new Set()).add(String(h.academic_year_id)));
  }
  const activos = new Set(estudiantesIds.map(String));
  const retirados = new Set(retiradosIds.map(String).filter((x) => !activos.has(x))).size;

  // Orden estable de presentación: por grado, grupo de origen y luego alfabético.
  const ordenadas = [...delAlcance].sort((a, b) => {
    const ga = grupoPorId.get(String(a.group_id))!;
    const gb = grupoPorId.get(String(b.group_id))!;
    const ua = usuarioPorId.get(String(a.student_id));
    const ub = usuarioPorId.get(String(b.student_id));
    return (
      (gradoPorId.get(String(ga.grade_id))?.numero ?? 0) - (gradoPorId.get(String(gb.grade_id))?.numero ?? 0) ||
      ga.nomenclatura.localeCompare(gb.nomenclatura, 'es', { numeric: true }) ||
      (ua?.apellido ?? '').localeCompare(ub?.apellido ?? '', 'es') ||
      (ua?.nombre ?? '').localeCompare(ub?.nombre ?? '', 'es')
    );
  });

  const nombreGrupo = (g: { nomenclatura: string; grade_id: Types.ObjectId }) => `${gradoPorId.get(String(g.grade_id))?.nombre ?? ''} ${g.nomenclatura}`.trim();

  interface Intermedia {
    fila: FilaRollover;
    gradoDestinoId: string | null;
    sedeId: string;
    jornadaId: string | null;
    prioridad: DatosDePrioridad;
    repitente: boolean;
    piar: boolean;
    edad: number | null;
  }
  const sinColocar = (fila: FilaRollover): Intermedia => ({
    fila,
    gradoDestinoId: null,
    sedeId: '',
    jornadaId: null,
    prioridad: { id: fila.student_id, promedio: null, anios_en_plantel: 0, faltas_graves: 0, apellido: '', nombre: '', documento: '' },
    repitente: false,
    piar: false,
    edad: null,
  });

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
      posicion_espera: null,
      paz_y_salvo: pazConfirmado.has(sid) ? 'CONFIRMADO' : 'PENDIENTE',
    };
    const colocable = dest === 'GRADO_SIGUIENTE' || dest === 'MISMO_GRADO';
    if (colocable && u && u.estado !== 'activo') return sinColocar({ ...base, motivo: 'El usuario del estudiante está inactivo.' });
    if (colocable && matriculadosDestino.has(sid)) return sinColocar({ ...base, estado: 'YA_TIENE_MATRICULA', motivo: `Ya tiene matrícula en ${destino.year}.` });
    if (colocable && modoContinuidad === 'CONFIRMADOS') {
      const respuesta = continuidadPorId.get(sid);
      if (respuesta === 'NO_CONTINUA') return sinColocar({ ...base, motivo: 'La familia informó que no continúa el año siguiente.' });
      if (!respuesta) return sinColocar({ ...base, estado: 'SIN_CONFIRMAR', motivo: 'La familia no ha confirmado que continúa: no se pre-matricula (se puede incluir eligiendo «todos»).' });
    }
    const perfil = perfilPorId.get(sid);
    if (colocable && perfil?.estado && ESTADOS_QUE_EXIGEN_REINGRESO.includes(perfil.estado)) {
      return sinColocar({ ...base, motivo: `Su expediente figura ${perfil.estado}: el regreso es un reingreso que se confirma en la matrícula.` });
    }
    if (!colocable) return sinColocar(base);
    const gradoDestino = dest === 'GRADO_SIGUIENTE' ? siguiente : gradoOrigen;
    const entrada = cierreEntrada(cierre);
    const faltas = entrada.faltas_por_gravedad ?? {};
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
      prioridad: {
        id: sid,
        promedio: entrada.promedio_general ?? null,
        anios_en_plantel: aniosPorEstudiante.get(sid)?.size ?? 0,
        faltas_graves: (faltas['II'] ?? 0) + (faltas['III'] ?? 0),
        apellido: u?.apellido ?? '',
        nombre: u?.nombre ?? '',
        documento: u?.numero_documento ?? '',
      },
      repitente: dest === 'MISMO_GRADO',
      piar: Boolean(entrada.tiene_piar),
      edad: edadCumplida(perfil?.fecha_nacimiento, destino.fecha_inicio),
    };
  });

  // Lo que ya hay en cada grupo del año siguiente (etapas anteriores): para no concentrar repitentes, PIAR o edades en un solo salón.
  const piarDeDestino = new Set(cierresDeDestino.filter((c) => cierreEntrada(c).tiene_piar).map((c) => String(c.student_id)));
  const composicion = new Map<string, { repitentes: number; con_piar: number; edades: number[] }>();
  for (const m of matriculasDestino) {
    const c = composicion.get(String(m.group_id)) ?? { repitentes: 0, con_piar: 0, edades: [] };
    if (m.tipo_ingreso === 'REPITENTE') c.repitentes += 1;
    if (piarDeDestino.has(String(m.student_id))) c.con_piar += 1;
    const edad = edadCumplida(perfilPorId.get(String(m.student_id))?.fecha_nacimiento, destino.fecha_inicio);
    if (edad !== null) c.edades.push(edad);
    composicion.set(String(m.group_id), c);
  }

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
        i.fila.motivo = 'Su sede no tiene ningún grupo de ese grado en el año siguiente: créalo en «Grupos» antes de reservar.';
      }
      alertas.push(`${gradoNombre}: no hay grupos en el año siguiente en la sede; ${miembros.length} estudiante(s) quedan sin cupo.`);
      continue;
    }
    const enPrioridad = ordenarPorPrioridad(miembros.map((i) => i.prioridad), config.criterios_desempate);
    const porId = new Map(miembros.map((i) => [i.fila.student_id, i]));
    const iniciales: GrupoParalelo[] = paralelos.map((g) => ({
      id: String(g._id),
      nomenclatura: g.nomenclatura,
      jornada_id: g.jornada_id ? String(g.jornada_id) : null,
      capacidad: g.max_capacity,
      ocupados: g.cupos_ocupados,
      repitentes: composicion.get(String(g._id))?.repitentes ?? 0,
      con_piar: composicion.get(String(g._id))?.con_piar ?? 0,
      edades: composicion.get(String(g._id))?.edades ?? [],
    }));
    const { asignado, grupos: finales } = repartirConBalanceo(
      enPrioridad.map((p) => {
        const i = porId.get(p.id)!;
        return { id: p.id, jornada_id: i.jornadaId, repitente: i.repitente, piar: i.piar, edad: i.edad };
      }),
      iniciales,
      config.tolerancia_ocupacion_pct
    );
    let espera = 0;
    for (const p of enPrioridad) {
      const i = porId.get(p.id)!;
      const gid = asignado.get(p.id) ?? null;
      if (gid) {
        i.fila.grupo_destino_id = gid;
        i.fila.grupo_destino = nombreGrupo(gruposDestinoPorId.get(gid)!);
      } else {
        espera += 1;
        i.fila.estado = 'EN_ESPERA';
        i.fila.posicion_espera = espera;
        i.fila.motivo = `Los cupos de ${gradoNombre} se agotaron con quienes tienen más prioridad: lista de espera n.º ${espera}, para asignación directiva.`;
      }
    }
    if (espera > 0) alertas.push(`${gradoNombre}: faltan ${espera} cupo(s); ${espera} estudiante(s) pasan a la lista de espera.`);
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
  if (pendientesM18 > 0) alertas.push(`${pendientesM18} estudiante(s) esperan la resolución de recuperaciones (M18) y no se proyectan todavía.`);
  if (f.group_id && filas.some((x) => x.estado === 'EN_ESPERA')) {
    alertas.push('Procesas un solo grupo: la prioridad por cupos solo compara a sus estudiantes. Para que compitan con los de los grupos paralelos, procesa todo el grado.');
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
      en_espera: cuenta('EN_ESPERA'),
      sin_cupo: cuenta('SIN_CUPO'),
      sin_confirmar: cuenta('SIN_CONFIRMAR'),
      no_aplica: cuenta('NO_APLICA'),
      por_destino,
    },
  };
}

/** Estudiantes con un paz y salvo CONFIRMADO de algún año anterior al de destino (el que cubre al año que termina). */
async function pazYSalvoConfirmados(estudiantesIds: Types.ObjectId[], anioDestino: number): Promise<Set<string>> {
  const confirmados = await PazYSalvo.find({ student_id: { $in: estudiantesIds }, estado: 'CONFIRMADO' }).select('student_id academic_year_id');
  if (confirmados.length === 0) return new Set();
  const anios = await AcademicYear.find({ _id: { $in: confirmados.map((c) => c.academic_year_id) }, year: { $lt: anioDestino } }).select('_id');
  const validos = new Set(anios.map((a) => String(a._id)));
  return new Set(confirmados.filter((c) => validos.has(String(c.academic_year_id))).map((c) => String(c.student_id)));
}

/** Aplica el alcance de sedes de quien consulta; pedir una sede que no tiene asignada es 403 en vez de devolver una lista vacía engañosa. */
function alcanceParaConsulta(f: FiltrosRollover, usuario: UserDocument): 'TODAS' | string[] {
  const alcance = alcanceDeSedes(usuario);
  if (alcance !== 'TODAS' && f.sede_id && !alcance.includes(f.sede_id)) throw new ApiError(403, 'Esa sede no está entre las que tienes asignadas.');
  return alcance;
}

export async function simularRollover(f: FiltrosRollover, usuario: UserDocument): Promise<PlanRollover> {
  exigirConsulta(usuario);
  return planificar(f, alcanceParaConsulta(f, usuario));
}

/** Plazo para legalizar: desde que arranca el año siguiente (o desde hoy, si ya arrancó), los días que el colegio da de partida. */
function plazoDeLegalizacion(destino: AcademicYearDocument): Date {
  const base = Math.max(destino.fecha_inicio.getTime(), Date.now());
  return new Date(new Date(base + DIAS_PLAZO_LEGALIZACION * 86_400_000).toISOString().slice(0, 10));
}

/** Lo mínimo que hace falta para reservar un cupo; lo comparten el rollover y la asignación manual desde la lista de espera. */
export interface DatosPreMatricula {
  student_id: string;
  tipo_ingreso: TipoIngreso;
  grupo_destino_id: string;
  grupo_origen: string;
  grupo_destino: string;
}

/**
 * Crea la pre-matrícula (PREINSCRITO, sin folio) y aparta el cupo con una actualización condicionada: si el grupo se llenó entre la
 * simulación y ahora, falla en vez de pasarse del cupo. Se ejecuta dentro de la transacción de quien la llama.
 */
export async function crearPreMatricula(fila: DatosPreMatricula, destino: AcademicYearDocument, session: ClientSession): Promise<Types.ObjectId> {
  await exigirSinMatriculaViva(fila.student_id, destino._id, session);
  const grupo = await Group.findOneAndUpdate(
    { _id: fila.grupo_destino_id, academic_year_id: destino._id, estado: 'ACTIVE', $expr: { $lt: ['$cupos_ocupados', '$max_capacity'] } },
    { $inc: { cupos_ocupados: 1 } },
    { new: true, session }
  );
  if (!grupo) throw new ApiError(409, 'El grupo ya no tiene cupo.');
  const grado = await Grade.findById(grupo.grade_id).session(session);
  if (!grado) throw new ApiError(404, 'Grado no encontrado.');

  const [perfil, vinculo] = await Promise.all([
    StudentProfile.findOne({ user_id: fila.student_id }).session(session),
    StudentGuardian.findOne({ student_id: fila.student_id, es_principal: true }).session(session),
  ]);
  const checklist = (await generarChecklistDesdeCatalogo({
    nivel: grado.nivel,
    numeroGrado: grado.numero,
    tipoIngreso: fila.tipo_ingreso,
    tieneDiscapacidad: perfil?.tiene_discapacidad,
    parentescoAcudiente: vinculo?.parentesco,
  })).map((item) => ({
    tipo_documento: item.tipo_documento,
    nombre_personalizado: item.nombre_personalizado ?? null,
    indicacion: item.indicacion ?? null,
    categoria: item.categoria ?? null,
    obligatorio: item.obligatorio,
    estado: 'PENDIENTE' as EstadoDocumentoMatricula,
    archivo_path: null,
    comentario: null,
    fecha_carga: null,
    revisado_por: null,
  }));
  // Si el paz y salvo del año que termina ya está confirmado, el documento nace aprobado; si no, queda pendiente (candado de la formalización).
  const itemPazYSalvo = checklist.find((c) => c.tipo_documento === 'PAZ_Y_SALVO_ANIO_ANTERIOR');
  if (itemPazYSalvo) {
    const previo = await pazYSalvoConfirmadoPrevio(fila.student_id, destino.year);
    if (previo) aprobarItemConPazYSalvo(itemPazYSalvo, previo);
  }

  const [matricula] = await Enrollment.create(
    [
      {
        student_id: fila.student_id,
        group_id: grupo._id,
        academic_year_id: destino._id,
        tipo_ingreso: fila.tipo_ingreso,
        estado: 'PREINSCRITO',
        fecha_matricula: new Date(),
        fecha_limite_legalizacion: plazoDeLegalizacion(destino),
        checklist,
      },
    ],
    { session }
  );
  if (!matricula) throw new ApiError(500, 'No se pudo crear la pre-matrícula.');
  return matricula._id;
}

export interface ResultadoRollover {
  creadas: number;
  en_espera: number;
  plan: PlanRollover['resumen'];
}

const nombreCompleto = (f: FilaRollover) => `${f.estudiante.apellido} ${f.estudiante.nombre}`.trim();

/**
 * Reserva cupo en el año siguiente a quien lo merece: crea PRE-matrículas (PREINSCRITO, sin folio) que la secretaría formaliza cuando
 * lleguen los documentos; nunca matrículas automáticas. Quien no alcanzó cupo queda en la lista de espera. Lo hacen el ADMIN y la
 * secretaría (esta solo en sus sedes), con su contraseña. **Todo o nada**: las pre-matrículas, los cupos y la lista de espera se escriben en
 * una sola transacción; si algo falla (p. ej. un grupo se llenó mientras tanto) no queda nada a medias y hay que volver a simular. Repetirlo no
 * duplica (quien ya tiene matrícula viva se omite).
 */
export async function ejecutarRollover(f: FiltrosRollover, contrasena: string, usuario: UserDocument, ip?: string | null): Promise<ResultadoRollover> {
  if (!PUEDEN_EJECUTAR.includes(usuario.rol)) throw new ApiError(403, 'Solo el administrador y la secretaría reservan los cupos del año siguiente.');
  const alcance = alcanceParaConsulta(f, usuario);
  const quien = await User.findById(usuario._id).select('+password_hash');
  if (!quien || !(await quien.comparePassword(contrasena))) throw new ApiError(401, 'Contraseña incorrecta.');

  const plan = await planificar(f, alcance);
  const destino = await cargarAnio(f.destino_id);
  const porCrear = plan.filas.filter((x) => x.estado === 'POR_CREAR');
  const enEspera = plan.filas.filter((x) => x.estado === 'EN_ESPERA');

  let creadas: Array<{ fila: FilaRollover; matriculaId: Types.ObjectId }> = [];
  await runTransaction(async (session) => {
    creadas = [];
    for (const fila of porCrear) {
      try {
        const matriculaId = await crearPreMatricula(
          { student_id: fila.student_id, tipo_ingreso: fila.tipo_ingreso as TipoIngreso, grupo_destino_id: fila.grupo_destino_id as string, grupo_origen: fila.grupo_origen, grupo_destino: fila.grupo_destino as string },
          destino,
          session
        );
        creadas.push({ fila, matriculaId });
        // Si estaba en la lista de espera de una corrida anterior, ya obtuvo cupo.
        await ListaEsperaRematricula.updateMany(
          { student_id: fila.student_id, destino_academic_year_id: destino._id, estado: 'EN_ESPERA' },
          { $set: { estado: 'ASIGNADA', enrollment_id: matriculaId, resuelta_por: usuario._id, resuelta_at: new Date(), motivo: 'Obtuvo cupo al repetir la rematrícula.' } },
          { session }
        );
      } catch (err) {
        if (err instanceof ApiError) throw new ApiError(err.statusCode, `${nombreCompleto(fila)}: ${err.message} No se creó ninguna pre-matrícula; vuelve a simular.`);
        throw err;
      }
    }
    for (const fila of enEspera) {
      await ListaEsperaRematricula.updateOne(
        { student_id: fila.student_id, destino_academic_year_id: destino._id, estado: 'EN_ESPERA' },
        {
          $set: {
            origen_academic_year_id: plan.origen.id,
            enrollment_origen_id: fila.enrollment_id,
            sede_id: fila.sede_id,
            jornada_id: fila.jornada_id,
            grado_destino_id: fila.grado_destino_id,
            tipo_ingreso: fila.tipo_ingreso,
            grupo_origen: fila.grupo_origen,
            posicion: fila.posicion_espera,
          },
        },
        { upsert: true, session }
      );
    }
  });

  for (const { fila, matriculaId } of creadas) {
    await registrarEvento({
      usuario_id: usuario._id,
      accion: 'MATRICULA_PREINSCRITA_POR_PROMOCION',
      entidad: 'Enrollment',
      entidad_id: matriculaId,
      detalle: `${fila.tipo_ingreso}, ${fila.grupo_origen} -> ${fila.grupo_destino}`,
    });
  }
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'PROMOCION_ROLLOVER_EJECUTADO',
    entidad: 'AcademicYear',
    entidad_id: destino._id,
    detalle: `${plan.origen.year} -> ${plan.destino.year}${f.group_id ? ' (un grupo)' : f.grade_id ? ' (un grado)' : ''}: ${creadas.length} pre-matrícula(s), ${enEspera.length} en lista de espera, ${plan.resumen.sin_cupo} sin cupo`,
    ip,
  });
  return { creadas: creadas.length, en_espera: enEspera.length, plan: plan.resumen };
}
