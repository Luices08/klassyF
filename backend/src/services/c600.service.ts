import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import Campus from '../models/campus.model';
import ConfiguracionCertificados from '../models/configuracionCertificados.model';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import Institution from '../models/institution.model';
import StudentProfile from '../models/studentProfile.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { finDelDia } from '../utils/calendarioAcademico';
import {
  FilaBalance,
  FilaEdad,
  FilaResultados,
  MatriculaC600,
  aFechaIso,
  armarBalance,
  armarEdades,
  armarResultados,
  desdeFechaIso,
  hayOtroSinDato,
  sexoDeC600,
} from '../utils/c600';
import { GradoDelDashboard, clasificarEstudiante } from '../utils/dashboard';
import { nombreDeArchivo } from '../utils/reporteTabular';
import { FiltrosAlcance, gruposDelAlcance } from './alcanceReportes.service';
import { registrarEvento } from './audit.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { idsDeGradosSinReprobacion } from './nivelesSinReprobacion.service';

export interface FiltrosC600 extends FiltrosAlcance {
  academic_year_id: string;
  /** `AAAA-MM-DD`: el día en que se cuentan los años cumplidos. Sin él, el inicio del periodo 1. */
  fecha_corte?: string;
}

export interface ReporteC600 {
  generado_en: Date;
  institucion: { nombre: string; codigo_dane: string };
  /** `null` = varias sedes. */
  sede: { nombre: string; codigo_dane: string } | null;
  /** `null` = varias jornadas. */
  jornada: string | null;
  anio: number;
  fecha_inicio_anio: string;
  fecha_corte_edad: string;
  /** PRELIMINAR mientras algún matriculado no tenga resultado final (cierre de promoción de M19). */
  estado_datos: 'PRELIMINAR' | 'DEFINITIVO';
  leyenda: string;
  grados: GradoDelDashboard[];
  balance: { filas: FilaBalance[]; total: Omit<FilaBalance, 'grado_id' | 'grado' | 'grado_numero'> };
  resultados: { filas: FilaResultados[]; total: Omit<FilaResultados, 'grado_id' | 'grado' | 'grado_numero'> };
  edades: { filas: FilaEdad[]; total_por_grado: Record<string, FilaEdad['total']>; sin_fecha_nacimiento: number };
  /** Se agrega la columna «Otro / sin dato» solo cuando hay alguien en ella. */
  hay_otro_sin_dato: boolean;
  firma: { cargo: string; nombre: string; fecha_expedicion: string };
  nombre_archivo: string;
}

const PUEDEN_REVISAR: string[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

const LEYENDA =
  'Estructura tipo C-600 del DANE armada con lo que registra el sistema; validarla con el formulario oficial vigente antes de reportar. El sector y los códigos DIVIPOLA no están en el sistema: se escriben a mano. ' +
  'Matrícula inicial: matriculados hasta el día en que empezó el periodo 1; ingresados: matriculados después. Retirados incluye los traslados a otro colegio. ' +
  'Los resultados salen del cierre de promoción del año.';

/** Las matrículas del año del alcance (activas y retiradas) con lo que el reporte necesita de cada estudiante. Un retirado que volvió a matricularse el mismo año cuenta una sola vez, con la viva. */
async function leerMatriculas(anioId: unknown, gruposIds: unknown[], gradoPorGrupo: Map<string, string>, sinReprobacion: Set<string>, finInicio: Date): Promise<MatriculaC600[]> {
  const matriculas = await Enrollment.find({ academic_year_id: anioId, group_id: { $in: gruposIds }, estado: { $in: [...ESTADOS_MATRICULA_ACTIVOS, 'RETIRADO'] } })
    .select('student_id group_id estado fecha_matricula')
    .lean();
  const conViva = new Set(matriculas.filter((m) => m.estado !== 'RETIRADO').map((m) => String(m.student_id)));
  const utiles = matriculas.filter((m) => m.estado !== 'RETIRADO' || !conViva.has(String(m.student_id)));
  const estudiantes = [...new Set(utiles.map((m) => String(m.student_id)))];

  const [perfiles, cierres] = await Promise.all([
    StudentProfile.find({ user_id: { $in: estudiantes } }).select('user_id genero fecha_nacimiento').lean(),
    EvaluacionPromocion.find({ academic_year_id: anioId, vigente: true, student_id: { $in: estudiantes } }).select('student_id resultado').lean(),
  ]);
  const perfilPor = new Map(perfiles.map((p) => [String(p.user_id), p]));
  const cierrePor = new Map(cierres.map((c) => [String(c.student_id), c.resultado as string]));

  return utiles.flatMap((m): MatriculaC600[] => {
    const gradoId = gradoPorGrupo.get(String(m.group_id));
    if (!gradoId) return [];
    const perfil = perfilPor.get(String(m.student_id));
    const activa = m.estado !== 'RETIRADO';
    return [
      {
        grado_id: gradoId,
        sexo: sexoDeC600(perfil?.genero),
        situacion: activa ? 'ACTIVA' : 'RETIRADA',
        ingreso_tardio: m.fecha_matricula.getTime() > finInicio.getTime(),
        clasificacion: activa ? clasificarEstudiante({ resultado_oficial: cierrePor.get(String(m.student_id)) ?? null, perdidas: null, sin_reprobacion: sinReprobacion.has(gradoId) }) : null,
        nacimiento: perfil?.fecha_nacimiento ?? null,
      },
    ];
  });
}

/**
 * El reporte estadístico con la estructura del formulario C-600 (M30). Se calcula al pedirlo con lo que registran M03, M04 y M19; no guarda nada. La pantalla lo
 * muestra con esta misma respuesta, así que lo que se ve es lo que baja en Excel y en PDF. Secretaría solo ve las sedes que tiene asignadas.
 */
export async function generarReporteC600(filtros: FiltrosC600, usuario: UserDocument): Promise<ReporteC600> {
  if (!PUEDEN_REVISAR.includes(usuario.rol)) throw new ApiError(403, 'Solo administración, coordinación y secretaría consultan este reporte.');
  const anio = await cargarAnio(filtros.academic_year_id);
  const grupos = await gruposDelAlcance(anio._id, filtros, usuario);

  const primero = [...anio.periodos].sort((a, b) => a.numero - b.numero)[0];
  const inicio = primero?.fecha_inicio ?? anio.fecha_inicio;
  const corte = filtros.fecha_corte ? desdeFechaIso(filtros.fecha_corte) : inicio;
  if (!corte) throw new ApiError(400, 'La fecha de corte debe tener el formato AAAA-MM-DD.');

  const grados = new Map<string, GradoDelDashboard>();
  for (const g of grupos) grados.set(String(g.grade_id), { grado_id: String(g.grade_id), grado: g.grado, grado_numero: g.gradoNumero });
  const gradoPorGrupo = new Map(grupos.map((g) => [String(g._id), String(g.grade_id)]));

  const [institucion, sinReprobacion, config] = await Promise.all([
    Institution.findOne().select('nombre codigo_dane').lean(),
    idsDeGradosSinReprobacion(),
    ConfiguracionCertificados.findOne().select('rectoria').lean(),
  ]);
  const matriculas = await leerMatriculas(anio._id, grupos.map((g) => g._id), gradoPorGrupo, new Set(sinReprobacion), finDelDia(inicio));

  const listaGrados = [...grados.values()].sort((a, b) => a.grado_numero - b.grado_numero);
  const balance = armarBalance(listaGrados, matriculas);
  const resultados = armarResultados(listaGrados, matriculas);
  const edades = armarEdades(listaGrados, matriculas, corte);

  const sedes = [...new Set(grupos.map((g) => g.sede))];
  const jornadas = [...new Set(grupos.map((g) => g.jornada))];
  const sede = sedes.length === 1 ? await Campus.findById(grupos[0]?.sede_id).select('nombre codigo_dane_sede').lean() : null;
  const rector = config?.rectoria?.usuario_id ? await User.findById(config.rectoria.usuario_id).select('nombre apellido').lean() : null;

  const sinResultado = resultados.total.sin_resultado;
  return {
    generado_en: new Date(),
    institucion: { nombre: institucion?.nombre ?? '', codigo_dane: institucion?.codigo_dane ?? '' },
    sede: sede ? { nombre: sede.nombre, codigo_dane: sede.codigo_dane_sede } : null,
    jornada: jornadas.length === 1 ? (jornadas[0] ?? null) : null,
    anio: anio.year,
    fecha_inicio_anio: aFechaIso(inicio),
    fecha_corte_edad: aFechaIso(corte),
    estado_datos: sinResultado === 0 && balance.total.matricula_final > 0 ? 'DEFINITIVO' : 'PRELIMINAR',
    leyenda: LEYENDA,
    grados: listaGrados,
    balance,
    resultados,
    edades,
    hay_otro_sin_dato: hayOtroSinDato(resultados, edades),
    firma: { cargo: config?.rectoria?.cargo || 'Rector(a)', nombre: rector ? `${rector.nombre} ${rector.apellido}` : '', fecha_expedicion: aFechaIso(new Date()) },
    nombre_archivo: nombreDeArchivo('reporte-c600', anio.year, sede?.nombre ?? 'todas-las-sedes', jornadas.length === 1 ? jornadas[0] : 'todas-las-jornadas'),
  };
}

/** Bajar el reporte (Excel o PDF) queda en la auditoría; verlo en pantalla no, porque cambia con cada filtro y no lleva datos de personas. */
export async function auditarDescargaC600(reporte: ReporteC600, formato: 'excel' | 'pdf', anioId: string, usuario: UserDocument, ip?: string | null): Promise<void> {
  await registrarEvento({ usuario_id: usuario._id, accion: 'REPORTE_CIERRE_GENERADO', entidad: 'AcademicYear', entidad_id: anioId, detalle: `Reporte tipo C-600 (${formato}): ${reporte.grados.length} grado(s), ${reporte.estado_datos.toLowerCase()}`, ip });
}
