import { Types } from 'mongoose';
import { DIAS_PLAZO_LEGALIZACION, generarChecklistMatricula } from '../constants/matriculaChecklist';
import { ESTADOS_MATRICULA_ACTIVOS, EstadoDocumentoMatricula, TipoIngreso } from '../constants/enums';
import { ResultadoPromocion } from '../constants/promocion';
import { ROLES } from '../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import PazYSalvo from '../models/pazYSalvo.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudentProfile from '../models/studentProfile.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { asignarCupos, destinoDeRollover, DestinoRollover } from '../utils/rollover';
import { runTransaction } from '../utils/runTransaction';
import { ESTADOS_QUE_EXIGEN_REINGRESO } from '../utils/situacionEstudiante';
import { registrarEvento } from './audit.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { exigirSinMatriculaViva } from './enrollment.service';
import { aprobarItemConPazYSalvo, pazYSalvoConfirmadoPrevio } from './pazYSalvo.service';

const PUEDEN_CONSULTAR = [ROLES.ADMIN, ROLES.COORDINADOR];

/**
 * - POR_CREAR: se le reserva cupo con una pre-matrícula.
 * - YA_TIENE_MATRICULA: ya tiene matrícula viva en el año siguiente (el rollover se puede repetir sin duplicar).
 * - SIN_CUPO: le corresponde un grado, pero los grupos de su sede no tienen cupo.
 * - NO_APLICA: no se pre-matricula (ver `destino` y `motivo`).
 */
export type EstadoFilaRollover = 'POR_CREAR' | 'YA_TIENE_MATRICULA' | 'SIN_CUPO' | 'NO_APLICA';

export interface FiltrosRollover {
  origen_id: string;
  destino_id: string;
  sede_id?: string;
  grade_id?: string;
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
  /** Si el paz y salvo del año que termina ya está confirmado, el documento de la pre-matrícula nace aprobado; si no, queda pendiente. */
  paz_y_salvo: 'CONFIRMADO' | 'PENDIENTE';
}

export interface PlanRollover {
  origen: { id: string; year: number };
  destino: { id: string; year: number };
  filas: FilaRollover[];
  /** Estudiantes retirados o anulados del año que termina: no se pre-matriculan. */
  retirados: number;
  resumen: { total: number; por_crear: number; ya_tienen_matricula: number; sin_cupo: number; no_aplica: number; por_destino: Partial<Record<DestinoRollover, number>> };
}

function exigirConsulta(usuario: UserDocument): void {
  if (!PUEDEN_CONSULTAR.includes(usuario.rol)) throw new ApiError(403, 'Solo coordinación y el administrador consultan el paso de año.');
}

async function cargarAnios(f: FiltrosRollover): Promise<{ origen: AcademicYearDocument; destino: AcademicYearDocument }> {
  const [origen, destino] = await Promise.all([cargarAnio(f.origen_id), cargarAnio(f.destino_id)]);
  if (String(origen._id) === String(destino._id)) throw new ApiError(400, 'El año de origen y el de destino son el mismo.');
  if (destino.year <= origen.year) throw new ApiError(409, `El año de destino (${destino.year}) debe ser posterior al de origen (${origen.year}).`);
  if (destino.estado === 'CERRADO') throw new ApiError(409, `El año ${destino.year} ya está cerrado: no admite pre-matrículas.`);
  return { origen, destino };
}

/**
 * Calcula, sin escribir nada, a quién se le reserva cupo en el año siguiente y dónde. Solo LEE el cierre de promoción de M19 (resultado y
 * «no renueva cupo»); no decide nada académico. El reparto es determinista: la simulación y la ejecución dan lo mismo.
 */
export async function planificar(f: FiltrosRollover): Promise<PlanRollover> {
  const { origen, destino } = await cargarAnios(f);

  const [matriculas, grupos, grados] = await Promise.all([
    Enrollment.find({ academic_year_id: origen._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }),
    Group.find({ academic_year_id: origen._id }),
    Grade.find(),
  ]);
  const grupoPorId = new Map(grupos.map((g) => [String(g._id), g]));
  const gradoPorId = new Map(grados.map((g) => [String(g._id), g]));
  const gradoPorNumero = new Map(grados.filter((g) => g.estado !== 'inactivo').map((g) => [g.numero, g]));

  const delAlcance = matriculas.filter((m) => {
    const g = grupoPorId.get(String(m.group_id));
    if (!g) return false;
    if (f.sede_id && String(g.sede_id) !== f.sede_id) return false;
    if (f.grade_id && String(g.grade_id) !== f.grade_id) return false;
    return true;
  });
  const estudiantesIds = delAlcance.map((m) => m.student_id);

  const [usuarios, perfiles, cierres, yaMatriculados, retiradosIds, pazConfirmado] = await Promise.all([
    User.find({ _id: { $in: estudiantesIds } }).select('nombre apellido numero_documento estado'),
    StudentProfile.find({ user_id: { $in: estudiantesIds } }).select('user_id estado'),
    EvaluacionPromocion.find({ academic_year_id: origen._id, student_id: { $in: estudiantesIds }, vigente: true }),
    Enrollment.distinct('student_id', { academic_year_id: destino._id, student_id: { $in: estudiantesIds }, estado: { $nin: ['RETIRADO', 'ANULADO'] } }),
    Enrollment.distinct('student_id', { academic_year_id: origen._id, estado: { $in: ['RETIRADO', 'ANULADO'] } }),
    pazYSalvoConfirmados(estudiantesIds, destino.year),
  ]);
  const usuarioPorId = new Map(usuarios.map((u) => [String(u._id), u]));
  const perfilPorId = new Map(perfiles.map((p) => [String(p.user_id), p]));
  const cierrePorId = new Map(cierres.map((c) => [String(c.student_id), c]));
  const matriculadosDestino = new Set(yaMatriculados.map(String));
  const activos = new Set(estudiantesIds.map(String));
  const retirados = new Set(retiradosIds.map(String).filter((s) => !activos.has(s))).size;

  // Orden estable: por grupo de origen y luego alfabético, para que la cohorte tienda a quedar junta.
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

  // Cupos del año siguiente por grupo.
  const gruposDestino = await Group.find({ academic_year_id: destino._id, estado: 'ACTIVE' });
  const libres = new Map(gruposDestino.map((g) => [String(g._id), Math.max(0, g.max_capacity - g.cupos_ocupados)]));
  const nombreGrupo = (g: { nomenclatura: string; grade_id: Types.ObjectId }) => `${gradoPorId.get(String(g.grade_id))?.nombre ?? ''} ${g.nomenclatura}`.trim();

  interface Intermedia {
    fila: FilaRollover;
    gradoDestinoId: string | null;
    sedeId: string;
    jornadaId: string | null;
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
      paz_y_salvo: pazConfirmado.has(sid) ? 'CONFIRMADO' : 'PENDIENTE',
    };
    const colocable = dest === 'GRADO_SIGUIENTE' || dest === 'MISMO_GRADO';
    if (colocable && u && u.estado !== 'activo') return { fila: { ...base, motivo: 'El usuario del estudiante está inactivo.' }, gradoDestinoId: null, sedeId: '', jornadaId: null };
    if (colocable && matriculadosDestino.has(sid)) return { fila: { ...base, estado: 'YA_TIENE_MATRICULA', motivo: `Ya tiene matrícula en ${destino.year}.` }, gradoDestinoId: null, sedeId: '', jornadaId: null };
    const estadoPerfil = perfilPorId.get(sid)?.estado;
    if (colocable && estadoPerfil && ESTADOS_QUE_EXIGEN_REINGRESO.includes(estadoPerfil)) {
      return { fila: { ...base, motivo: `Su expediente figura ${estadoPerfil}: el regreso es un reingreso que se confirma en la matrícula.` }, gradoDestinoId: null, sedeId: '', jornadaId: null };
    }
    if (!colocable) return { fila: base, gradoDestinoId: null, sedeId: '', jornadaId: null };
    const gradoDestino = dest === 'GRADO_SIGUIENTE' ? siguiente : gradoOrigen;
    return {
      fila: { ...base, estado: 'POR_CREAR', tipo_ingreso: dest === 'MISMO_GRADO' ? 'REPITENTE' : 'ANTIGUO' },
      gradoDestinoId: gradoDestino ? String(gradoDestino._id) : null,
      sedeId: String(origenGrupo.sede_id),
      jornadaId: origenGrupo.jornada_id ? String(origenGrupo.jornada_id) : null,
    };
  });

  const porCrear = intermedias.filter((i) => i.fila.estado === 'POR_CREAR');
  const solicitudes = porCrear.map((i) => {
    const deSuGrado = gruposDestino.filter((g) => String(g.grade_id) === i.gradoDestinoId && String(g.sede_id) === i.sedeId);
    // Primero la misma jornada, luego el resto, cada bloque por nomenclatura.
    const ordenados = [...deSuGrado].sort(
      (a, b) =>
        Number(String(b.jornada_id) === i.jornadaId) - Number(String(a.jornada_id) === i.jornadaId) || a.nomenclatura.localeCompare(b.nomenclatura, 'es', { numeric: true })
    );
    return { id: i.fila.student_id, candidatos: ordenados.map((g) => String(g._id)) };
  });
  const reparto = asignarCupos(solicitudes, libres);
  const grupoDestinoPorId = new Map(gruposDestino.map((g) => [String(g._id), g]));
  for (const i of porCrear) {
    const gid = reparto.get(i.fila.student_id) ?? null;
    if (!gid) {
      i.fila.estado = 'SIN_CUPO';
      i.fila.motivo = 'Los grupos de su sede en el grado que le corresponde no tienen cupo (o aún no existen).';
      continue;
    }
    i.fila.grupo_destino_id = gid;
    i.fila.grupo_destino = nombreGrupo(grupoDestinoPorId.get(gid)!);
  }

  const filas = intermedias.map((i) => i.fila);
  const por_destino: Partial<Record<DestinoRollover, number>> = {};
  for (const fila of filas) por_destino[fila.destino] = (por_destino[fila.destino] ?? 0) + 1;
  return {
    origen: { id: String(origen._id), year: origen.year },
    destino: { id: String(destino._id), year: destino.year },
    filas,
    retirados,
    resumen: {
      total: filas.length,
      por_crear: filas.filter((x) => x.estado === 'POR_CREAR').length,
      ya_tienen_matricula: filas.filter((x) => x.estado === 'YA_TIENE_MATRICULA').length,
      sin_cupo: filas.filter((x) => x.estado === 'SIN_CUPO').length,
      no_aplica: filas.filter((x) => x.estado === 'NO_APLICA').length,
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

export async function simularRollover(f: FiltrosRollover, usuario: UserDocument): Promise<PlanRollover> {
  exigirConsulta(usuario);
  return planificar(f);
}

/** Plazo para legalizar: desde que arranca el año siguiente (o desde hoy, si ya arrancó), los días que el colegio da de partida. */
function plazoDeLegalizacion(destino: AcademicYearDocument): Date {
  const base = Math.max(destino.fecha_inicio.getTime(), Date.now());
  return new Date(new Date(base + DIAS_PLAZO_LEGALIZACION * 86_400_000).toISOString().slice(0, 10));
}

async function crearPreMatricula(fila: FilaRollover, destino: AcademicYearDocument, usuario: UserDocument): Promise<void> {
  await runTransaction(async (session) => {
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
    const checklist = generarChecklistMatricula({
      nivel: grado.nivel,
      numeroGrado: grado.numero,
      tipoIngreso: fila.tipo_ingreso as TipoIngreso,
      tieneDiscapacidad: perfil?.tiene_discapacidad,
      parentescoAcudiente: vinculo?.parentesco,
    }).map((item) => ({
      tipo_documento: item.tipo_documento,
      nombre_personalizado: item.nombre_personalizado ?? null,
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
    await registrarEvento({
      usuario_id: usuario._id,
      accion: 'MATRICULA_PREINSCRITA_POR_PROMOCION',
      entidad: 'Enrollment',
      entidad_id: matricula._id,
      detalle: `${fila.tipo_ingreso}, ${fila.grupo_origen} -> ${fila.grupo_destino}`,
    });
  });
}

export interface ResultadoRollover {
  creadas: number;
  fallidas: Array<{ student_id: string; estudiante: string; error: string }>;
  plan: PlanRollover['resumen'];
}

/**
 * Reserva cupo en el año siguiente a quien lo merece: crea PRE-matrículas (PREINSCRITO, sin folio) que la secretaría formaliza cuando
 * lleguen los documentos; nunca matrículas automáticas. Solo ADMIN, con su contraseña. Cada estudiante va en su propia transacción: si uno
 * falla se reporta y los demás siguen. Repetirlo no duplica (quien ya tiene matrícula viva se omite).
 */
export async function ejecutarRollover(f: FiltrosRollover, contrasena: string, usuario: UserDocument, ip?: string | null): Promise<ResultadoRollover> {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador reserva los cupos del año siguiente.');
  const admin = await User.findById(usuario._id).select('+password_hash');
  if (!admin || !(await admin.comparePassword(contrasena))) throw new ApiError(401, 'Contraseña incorrecta.');

  const plan = await planificar(f);
  const destino = await cargarAnio(f.destino_id);
  const fallidas: ResultadoRollover['fallidas'] = [];
  let creadas = 0;
  for (const fila of plan.filas.filter((x) => x.estado === 'POR_CREAR')) {
    try {
      await crearPreMatricula(fila, destino, usuario);
      creadas += 1;
    } catch (err) {
      fallidas.push({ student_id: fila.student_id, estudiante: `${fila.estudiante.apellido} ${fila.estudiante.nombre}`.trim(), error: err instanceof Error ? err.message : String(err) });
    }
  }
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'PROMOCION_ROLLOVER_EJECUTADO',
    entidad: 'AcademicYear',
    entidad_id: destino._id,
    detalle: `${plan.origen.year} -> ${plan.destino.year}: ${creadas} pre-matrícula(s), ${fallidas.length} fallida(s), ${plan.resumen.sin_cupo} sin cupo`,
    ip,
  });
  return { creadas, fallidas, plan: plan.resumen };
}
