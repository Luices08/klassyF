import { Types } from 'mongoose';
import { PERIODO_INFORME_FINAL } from '../constants/boletin';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import Campus from '../models/campus.model';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import Institution from '../models/institution.model';
import JornadaOperativa from '../models/jornadaOperativa.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { calcularPromedioGeneral } from '../utils/calculoNotas';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { evaluarPromocion } from '../utils/promocion';
import { ETIQUETA_PROMOCION_SABANA, calcularPuestos, etiquetaDeGrupo } from '../utils/sabanaCalificaciones';
import { desempenoCualitativo } from '../utils/siee';
import { registrarEvento } from './audit.service';
import { resumenAsistenciaParaBoletin } from './attendanceStats.service';
import { leerConfiguracionBoletin } from './boletinConfig.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { datosDePolitica, obtenerPolitica } from './politicaPromocion.service';
import { construirEntradasDelGrupo } from './promocionContexto.service';
import { exigirAcudienteDe } from './portalAcudiente.service';
import { exigirBoletinDisponible } from './publicacionBoletin.service';
import { cargarContextoNotas, clave } from './recuperacion.service';

export interface FiltrosInformeFinal {
  academic_year_id: string;
  group_id: string;
  /** Un solo estudiante; sin él, todo el grupo. */
  student_id?: string;
}

export interface NivelInforme {
  etiqueta: string;
  /** La equivalencia nacional (Superior/Alto/Básico/Bajo). */
  nivel: string;
  aprobado: boolean;
}

export interface AsignaturaInforme {
  subject_id: string;
  nombre: string;
  /** Nota efectiva de cada periodo (con la recuperación del periodo ya aplicada); null = no hay nota cerrada. */
  periodos: Array<{ numero: number; nota: number | null; exenta: boolean }>;
  /** Nota del año antes de la recuperación final. */
  nota_anual: number | null;
  /** Solo si hubo recuperación final y cambió la nota. */
  nota_recuperacion: number | null;
  nota_final: number | null;
  exenta: boolean;
  desempeno: NivelInforme | null;
  fallas: number;
}

export interface AreaInforme {
  area_id: string;
  nombre: string;
  nota_final: number | null;
  desempeno: NivelInforme | null;
  asignaturas: AsignaturaInforme[];
}

export interface EstudianteInforme {
  student_id: string;
  nombre_completo: string;
  documento: string;
  areas: AreaInforme[];
  promedio_general: number | null;
  desempeno_general: NivelInforme | null;
  puesto: number | null;
  asistencia: { justificadas: number; injustificadas: number; retardos: number };
  promocion: { codigo: string; texto: string; oficial: boolean };
  /** Todas las asignaturas tienen nota anual: sin eso el informe es parcial. */
  completo: boolean;
}

export type EstadoInformeFinal = 'PRELIMINAR' | 'DEFINITIVO';

export interface InformeFinal {
  generado_en: Date;
  estado_datos: EstadoInformeFinal;
  leyenda: string;
  institucion: { nombre: string; codigo_dane: string; nit: string; resolucion_aprobacion: string };
  anio: number;
  periodos: Array<{ numero: number; nombre: string; porcentaje: number }>;
  nota_aprobatoria: number;
  mostrar_puesto: boolean;
  grupo: { etiqueta: string; grado: string; sede: string; jornada: string; director: string | null };
  estudiantes: EstudianteInforme[];
}

const PUEDEN_CONSULTAR: string[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

function exigirAcceso(usuario: UserDocument): void {
  if (!PUEDEN_CONSULTAR.includes(usuario.rol)) throw new ApiError(403, 'Solo administración, coordinación y secretaría descargan el informe final del año.');
}

const nivelDe = (nota: number | null, escala: Parameters<typeof desempenoCualitativo>[1]): NivelInforme | null => {
  if (nota === null) return null;
  const r = desempenoCualitativo(nota, escala);
  return { etiqueta: r.etiqueta, nivel: r.nivel, aprobado: r.aprobado };
};

/**
 * Arma el informe final de un grupo. No guarda nada: se calcula al pedirlo con lo que hoy registran M12, M13, M18 y M19, así que se puede
 * bajar antes de las recuperaciones como apoyo y volver a bajar cuando todo esté actualizado. Una nota que falta es un hueco, nunca un cero.
 */
async function armarInformeDeGrupo(filtros: FiltrosInformeFinal): Promise<InformeFinal> {
  const anio = await cargarAnio(filtros.academic_year_id);
  const grupo = await Group.findById(filtros.group_id).lean();
  if (!grupo || String(grupo.academic_year_id) !== String(anio._id)) throw new ApiError(404, 'Grupo no encontrado en ese año lectivo.');

  const [grado, sede, jornada, institucion, config, politica, asignaciones, entradas, director] = await Promise.all([
    Grade.findById(grupo.grade_id).select('nombre numero').lean(),
    Campus.findById(grupo.sede_id).select('nombre').lean(),
    JornadaOperativa.findById(grupo.jornada_id).select('nombre').lean(),
    Institution.findOne().select('nombre codigo_dane nit resolucion_aprobacion').lean(),
    leerConfiguracionBoletin(),
    obtenerPolitica(filtros.academic_year_id).then(datosDePolitica),
    TeacherAssignment.find({ academic_year_id: anio._id, group_id: grupo._id, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO }).select('_id subject_id').lean(),
    construirEntradasDelGrupo(anio, grupo, 'CIERRE'),
    TeacherAssignment.findOne({ academic_year_id: anio._id, group_id: grupo._id, tipo_asignacion: 'DIRECCION_GRUPO', estado: ESTADO_ACTIVO }).populate<{ docente_id: { nombre: string; apellido: string } | null }>('docente_id', 'nombre apellido').lean(),
  ]);

  const asignacionDe = new Map(asignaciones.map((a) => [String(a.subject_id), a._id]));
  const [ctx, asistencia, cierres, usuarios, subjects] = await Promise.all([
    cargarContextoNotas(anio, asignaciones.map((a) => a._id)),
    resumenAsistenciaParaBoletin(grupo._id),
    EvaluacionPromocion.find({ academic_year_id: anio._id, group_id: grupo._id, vigente: true }).select('student_id resultado').lean(),
    User.find({ _id: { $in: entradas.map((e) => e.student_id) } }).select('nombre apellido numero_documento').lean(),
    Subject.find({ _id: { $in: asignaciones.map((a) => a.subject_id) } }).select('nombre').lean(),
  ]);
  const usuarioPor = new Map(usuarios.map((u) => [String(u._id), u]));
  const cierrePor = new Map(cierres.map((c) => [String(c.student_id), c.resultado]));
  const nombreAsignatura = new Map(subjects.map((s) => [String(s._id), s.nombre]));
  const escala = anio.escala_evaluacion;

  const estudiantes: EstudianteInforme[] = entradas.map((e) => {
    const u = usuarioPor.get(e.student_id);
    const asignaturasPorArea = new Map<string, AsignaturaInforme[]>();
    for (const a of e.entrada.asignaturas) {
      const asignacionId = asignacionDe.get(a.subject_id);
      const notas = asignacionId ? ctx.notas.get(clave(asignacionId, e.student_id)) : undefined;
      const exentas = anio.periodos.every((p) => notas?.exentos.has(p.numero));
      const fila: AsignaturaInforme = {
        subject_id: a.subject_id,
        nombre: nombreAsignatura.get(a.subject_id) ?? a.nombre,
        periodos: anio.periodos.map((p) => ({ numero: p.numero, nota: notas?.efectivas.get(p.numero) ?? null, exenta: notas?.exentos.has(p.numero) ?? false })),
        nota_anual: a.nota_antes,
        nota_recuperacion: a.nota_final !== a.nota_antes ? a.nota_final : null,
        nota_final: a.nota_final,
        exenta: exentas,
        desempeno: nivelDe(a.nota_final, escala),
        fallas: asistencia.fallasPorAsignatura.get(`${a.subject_id}_${e.student_id}`) ?? 0,
      };
      asignaturasPorArea.set(a.area_id, [...(asignaturasPorArea.get(a.area_id) ?? []), fila]);
    }
    const areas: AreaInforme[] = e.entrada.areas
      .map((area) => ({
        area_id: area.area_id,
        nombre: area.nombre,
        nota_final: area.nota_final,
        desempeno: nivelDe(area.nota_final, escala),
        asignaturas: (asignaturasPorArea.get(area.area_id) ?? []).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')),
      }))
      .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));

    const oficial = cierrePor.get(e.student_id);
    const codigo = oficial ?? evaluarPromocion(e.entrada, politica, 'CIERRE').resultado;
    const promedio = calcularPromedioGeneral(e.entrada.areas.map((a) => a.nota_final));
    const sinNota = e.entrada.asignaturas.filter((a) => a.nota_final === null && !anio.periodos.every((p) => ctx.notas.get(clave(asignacionDe.get(a.subject_id), e.student_id))?.exentos.has(p.numero))).length;
    const totales = asistencia.porEstudiante.get(e.student_id) ?? { justificadas: 0, injustificadas: 0, retardos: 0 };
    return {
      student_id: e.student_id,
      nombre_completo: u ? `${u.apellido} ${u.nombre}` : '',
      documento: u?.numero_documento ?? '',
      areas,
      promedio_general: promedio,
      desempeno_general: nivelDe(promedio, escala),
      puesto: null,
      asistencia: totales,
      promocion: { codigo, texto: ETIQUETA_PROMOCION_SABANA[codigo] ?? codigo, oficial: Boolean(oficial) },
      completo: sinNota === 0,
    };
  });
  estudiantes.sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo, 'es', { sensitivity: 'base' }));

  if (config.mostrar_puesto) {
    const puestos = calcularPuestos(estudiantes.map((s) => ({ id: s.student_id, promedio: s.promedio_general, completo: s.completo })));
    for (const s of estudiantes) s.puesto = puestos.get(s.student_id) ?? null;
  }

  const conCierre = estudiantes.filter((s) => s.promocion.oficial).length;
  const definitivo = estudiantes.length > 0 && conCierre === estudiantes.length;
  return {
    generado_en: new Date(),
    estado_datos: definitivo ? 'DEFINITIVO' : 'PRELIMINAR',
    leyenda: definitivo
      ? 'Informe definitivo: todos los estudiantes tienen el cierre de promoción del año.'
      : 'Informe preliminar: aún hay estudiantes sin cierre de promoción; la decisión mostrada es una proyección y las notas incluyen las recuperaciones registradas hasta hoy.',
    institucion: {
      nombre: institucion?.nombre ?? '',
      codigo_dane: institucion?.codigo_dane ?? '',
      nit: institucion?.nit ?? '',
      resolucion_aprobacion: institucion?.resolucion_aprobacion ?? '',
    },
    anio: anio.year,
    periodos: anio.periodos.map((p) => ({ numero: p.numero, nombre: p.nombre, porcentaje: p.porcentaje })),
    nota_aprobatoria: escalaEfectiva(escala).nota_aprobatoria,
    mostrar_puesto: config.mostrar_puesto,
    grupo: {
      etiqueta: etiquetaDeGrupo(grado?.numero ?? 0, grado?.nombre ?? '', grupo.nomenclatura),
      grado: grado?.nombre ?? '',
      sede: sede?.nombre ?? '',
      jornada: jornada?.nombre ?? '',
      director: director?.docente_id ? `${director.docente_id.nombre} ${director.docente_id.apellido}` : null,
    },
    estudiantes,
  };
}

/** Quien consulta el informe de un grupo: administración y coordinación, y secretaría solo en las sedes que tiene asignadas («no existe» = «no es de tu sede»). */
export async function exigirGrupoConsultable(groupId: string, usuario: UserDocument): Promise<void> {
  exigirAcceso(usuario);
  if (usuario.rol !== ROLES.SECRETARIA) return;
  const grupo = await Group.findById(groupId).select('sede_id').lean();
  if (!grupo || !(usuario.sedes_ids ?? []).some((s) => String(s) === String(grupo.sede_id))) throw new ApiError(404, 'Grupo no encontrado.');
}

/** Administración, coordinación y secretaría (esta solo de sus sedes): un estudiante o todo el grupo. */
export async function informeFinalParaPersonal(filtros: FiltrosInformeFinal, usuario: UserDocument, ip?: string | null): Promise<InformeFinal> {
  await exigirGrupoConsultable(filtros.group_id, usuario);
  const informe = await armarInformeDeGrupo(filtros);
  if (filtros.student_id) {
    informe.estudiantes = informe.estudiantes.filter((s) => s.student_id === filtros.student_id);
    if (informe.estudiantes.length === 0) throw new ApiError(404, 'El estudiante no tiene matrícula activa en ese grupo.');
  }
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'REPORTE_CIERRE_GENERADO',
    entidad: 'Group',
    entidad_id: filtros.group_id,
    detalle: `Informe final del año: ${informe.estudiantes.length} estudiante(s)`,
    ip,
  });
  return informe;
}

/** El estudiante o su acudiente: solo lo propio, y solo cuando el administrador publicó el informe final del grupo (o dejó una excepción). */
export async function informeFinalParaFamilia(params: { academic_year_id: string; student_id: string }, usuario: UserDocument, ip?: string | null): Promise<InformeFinal> {
  if (usuario.rol === ROLES.ESTUDIANTE) {
    if (String(usuario._id) !== params.student_id) throw new ApiError(404, 'Estudiante no encontrado.');
  } else if (usuario.rol === ROLES.ACUDIENTE) {
    await exigirAcudienteDe(usuario, params.student_id);
  } else {
    throw new ApiError(403, 'No tienes acceso a este informe.');
  }
  if (!Types.ObjectId.isValid(params.student_id)) throw new ApiError(404, 'Estudiante no encontrado.');
  const matricula = await Enrollment.findOne({ student_id: params.student_id, academic_year_id: params.academic_year_id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).select('group_id').lean();
  if (!matricula) throw new ApiError(404, 'El estudiante no tiene una matrícula activa en ese año lectivo.');
  await exigirBoletinDisponible({ group_id: String(matricula.group_id), academic_year_id: params.academic_year_id, periodo_numero: PERIODO_INFORME_FINAL }, params.student_id);
  const informe = await armarInformeDeGrupo({ academic_year_id: params.academic_year_id, group_id: String(matricula.group_id) });
  informe.estudiantes = informe.estudiantes.filter((s) => s.student_id === params.student_id);
  await registrarEvento({ usuario_id: usuario._id, accion: 'REPORTE_CIERRE_GENERADO', entidad: 'User', entidad_id: params.student_id, detalle: 'Informe final del año consultado por la familia', ip });
  return informe;
}
