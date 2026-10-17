import { Types } from 'mongoose';
import { ESTADOS_NOTA_CERRADOS } from '../constants/notas';
import { NOMBRES_TIPO_SALIDA, TipoSalida } from '../constants/salidas';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import Area from '../models/area.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import Institution from '../models/institution.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { acumuladoDeNotas, NotaOficialDePeriodo, periodosDelRetiro } from '../utils/boletinRetiro';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { aDiaDeCalendario, grupoEnFecha } from '../utils/salidas';
import { desempenoCualitativo } from '../utils/siee';
import { registrarEvento } from './audit.service';
import { calcularEstadisticas } from './attendanceStats.service';
import { leerConfiguracionBoletin } from './boletinConfig.service';
import { armarFila, cargarContextoPlanilla } from './notas.service';
import { exigirPazYSalvoDeSalidaAprobado } from './pazYSalvoSalida.service';
import { boletinDePeriodoDeEstudiante, ReportCardNivelEscala, ReportCardResult } from './reportCard.service';

/**
 * Boletín parcial de retiro (M17): el informe académico acumulado de quien sale durante el año. Consolida las definitivas oficiales de los periodos
 * ya cerrados (M05, M12: la misma cuenta del boletín de cada periodo, con recuperaciones y notas homologadas) y, solo si el SIEE del colegio lo
 * autoriza (`ConfiguracionBoletin.incluir_corte_en_retiro`), una columna aparte con el corte parcial del periodo en curso, marcada como no definitiva y fuera
 * del acumulado. Es solo lectura: no guarda ni cambia ninguna nota.
 */

export type EstadoNotaRetiro = 'CERRADO' | 'DEFINITIVO' | 'HOMOLOGADA_EXTERNA' | 'EXENTA_POR_TRASLADO' | 'SIN_CERRAR';

export interface NotaDePeriodoRetiro {
  periodo: number;
  nota: number | null;
  estado: EstadoNotaRetiro;
}

export interface AsignaturaBoletinRetiro {
  subject_id: string;
  area: string;
  nombre: string;
  /** Una por periodo oficial, en orden. */
  notas: NotaDePeriodoRetiro[];
  acumulado: number | null;
  desempeno_acumulado: string | null;
  /** Corte parcial del periodo en curso (si el SIEE lo permite): provisional, no entra en el acumulado. */
  corte: { nota: number | null; parcial: boolean } | null;
}

export interface BoletinRetiro {
  enrollment_id: string;
  estudiante: { id: string; nombre_completo: string; documento: string; grado: string; grupo: string; sede: string; jornada: string };
  institucion: { nombre: string; codigo_dane: string; nit: string; resolucion_aprobacion: string };
  academic_year: number;
  salida: { tipo: TipoSalida; nombre_tipo: string; fecha_efectiva: Date; institucion_receptora: string | null };
  periodos: Array<{ numero: number; nombre: string; porcentaje: number; completo: boolean; promedio: number | null }>;
  /** El periodo en curso al salir cuando el SIEE permite exportar el corte. */
  periodo_corte: { numero: number; nombre: string } | null;
  asignaturas: AsignaturaBoletinRetiro[];
  promedio_acumulado: number | null;
  desempeno_acumulado: string | null;
  asistencia: { fallas_justificadas: number; fallas_injustificadas: number; retardos: number };
  escala: ReportCardNivelEscala[];
  /** Lo que el lector debe saber para interpretar el documento (periodos incompletos, corte no incluido, salida anterior al módulo). */
  advertencias: string[];
  /** Falta algo oficial: el documento es informativo, no definitivo. */
  completo: boolean;
}

/** Datos de la salida que el boletín necesita; las salidas anteriores a este módulo no tienen fecha efectiva y se aproximan con el día en que se registraron. */
async function cargarSalida(enrollmentId: string, usuario: UserDocument) {
  const matricula = Types.ObjectId.isValid(enrollmentId) ? await Enrollment.findById(enrollmentId) : null;
  if (!matricula || matricula.estado !== 'RETIRADO') throw new ApiError(404, 'Salida no encontrada.');
  if (usuario.rol === ROLES.SECRETARIA) {
    const grupo = await Group.findById(matricula.group_id).select('sede_id').lean();
    if (!grupo || !usuario.sedes_ids.some((s) => String(s) === String(grupo.sede_id))) throw new ApiError(404, 'Salida no encontrada.');
  }
  return matricula;
}

export async function armarBoletinRetiro(enrollmentId: string, usuario: UserDocument): Promise<BoletinRetiro> {
  const matricula = await cargarSalida(enrollmentId, usuario);
  const [anio, estudiante, configuracion] = await Promise.all([
    AcademicYear.findById(matricula.academic_year_id),
    User.findById(matricula.student_id),
    leerConfiguracionBoletin(),
  ]);
  if (!anio || !estudiante) throw new ApiError(404, 'Salida no encontrada.');

  const advertencias: string[] = [];
  const salida = matricula.salida;
  if (!salida) advertencias.push('La salida se registró antes del módulo de retiros y no tiene fecha efectiva: se tomó el día en que se registró.');
  const fechaEfectiva = salida?.fecha_efectiva ?? aDiaDeCalendario(matricula.updatedAt);

  const { oficiales, corte, omitido } = periodosDelRetiro(anio.periodos, fechaEfectiva, configuracion.incluir_corte_en_retiro);
  const tramos = matricula.trayectoria.map((t) => ({ group_id: String(t.group_id), desde: t.desde, hasta: t.hasta }));
  const grupoDe = (fecha: Date): Types.ObjectId => new Types.ObjectId(grupoEnFecha(tramos, fecha) ?? String(matricula.group_id));
  const menorFecha = (a: Date, b: Date): Date => (a.getTime() <= b.getTime() ? a : b);

  const boletines: ReportCardResult[] = [];
  for (const periodo of oficiales) {
    boletines.push(await boletinDePeriodoDeEstudiante(estudiante, anio, grupoDe(menorFecha(periodo.fecha_fin, fechaEfectiva)), periodo.numero));
  }

  // Filas por asignatura a partir de lo que dijo cada boletín de periodo (misma malla, mismas áreas, mismos pesos del plan de estudios).
  const filas = new Map<string, AsignaturaBoletinRetiro>();
  const porcentajes = oficiales.map((p) => p.porcentaje);
  boletines.forEach((boletin, indice) => {
    for (const area of boletin.areas) {
      for (const asignatura of area.asignaturas) {
        const fila = filas.get(asignatura.subject_id) ?? { subject_id: asignatura.subject_id, area: area.nombre, nombre: asignatura.nombre, notas: [], acumulado: null, desempeno_acumulado: null, corte: null };
        const periodo = oficiales[indice]!.numero;
        fila.notas.push({ periodo, nota: asignatura.nota_asignatura, estado: asignatura.estado });
        filas.set(asignatura.subject_id, fila);
      }
    }
  });
  // Una asignatura que no aparece en todos los periodos (p. ej. agregada al grupo después) se alinea con «sin cerrar» donde faltó.
  for (const fila of filas.values()) {
    fila.notas = oficiales.map((p) => fila.notas.find((n) => n.periodo === p.numero) ?? { periodo: p.numero, nota: null, estado: 'SIN_CERRAR' as const });
  }

  const escala = escalaEfectiva(anio.escala_evaluacion);
  for (const fila of filas.values()) {
    const entradas: NotaOficialDePeriodo[] = fila.notas.map((n) => ({ nota: n.nota, exenta: n.estado === 'EXENTA_POR_TRASLADO' }));
    fila.acumulado = acumuladoDeNotas(entradas, porcentajes);
    fila.desempeno_acumulado = fila.acumulado === null ? null : desempenoCualitativo(fila.acumulado, anio.escala_evaluacion).etiqueta;
  }

  // Corte parcial del periodo en curso: lo que la planilla muestra hoy, provisional y fuera del acumulado.
  if (corte) {
    const grupoCorte = grupoDe(fechaEfectiva);
    const asignaciones = await TeacherAssignment.find({ group_id: grupoCorte, academic_year_id: anio._id, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO });
    const persona = { _id: String(estudiante._id), nombre: estudiante.nombre, apellido: estudiante.apellido, numero_documento: estudiante.numero_documento };
    const nuevas: Array<{ subject_id: string; nota: number | null; parcial: boolean }> = [];
    for (const asignacion of asignaciones) {
      const ctx = await cargarContextoPlanilla(asignacion, corte.numero);
      const fila = armarFila(ctx, persona);
      nuevas.push({ subject_id: String(asignacion.subject_id), nota: fila.nota_asignatura, parcial: fila.parcial || !ESTADOS_NOTA_CERRADOS.some((e) => e === fila.estado) });
    }
    const sinFila = nuevas.filter((n) => !filas.has(n.subject_id));
    if (sinFila.length > 0) {
      const asignaturas = await Subject.find({ _id: { $in: sinFila.map((n) => n.subject_id) } }).select('nombre area_id').lean();
      const areas = await Area.find({ _id: { $in: asignaturas.map((s) => s.area_id) } }).select('nombre').lean();
      const nombreArea = new Map(areas.map((a) => [String(a._id), a.nombre]));
      for (const s of asignaturas) {
        filas.set(String(s._id), {
          subject_id: String(s._id),
          area: nombreArea.get(String(s.area_id)) ?? '',
          nombre: s.nombre,
          notas: oficiales.map((p) => ({ periodo: p.numero, nota: null, estado: 'SIN_CERRAR' as const })),
          acumulado: null,
          desempeno_acumulado: null,
          corte: null,
        });
      }
    }
    for (const n of nuevas) {
      const fila = filas.get(n.subject_id);
      if (fila) fila.corte = { nota: n.nota, parcial: n.parcial };
    }
  }

  const promediosPeriodo = boletines.map((b) => b.promedio_general_periodo);
  const promedioAcumulado = acumuladoDeNotas(promediosPeriodo.map((nota) => ({ nota, exenta: false })), porcentajes);
  const asistencia = await calcularEstadisticas({ academic_year_id: String(anio._id), agrupar_por: 'estudiante', student_id: String(estudiante._id), hasta: fechaEfectiva }, null);

  const completo = boletines.length > 0 && boletines.every((b) => b.completo);
  if (oficiales.length === 0) advertencias.push('Aún no hay periodos cerrados en los que el estudiante haya estado: el documento no tiene notas definitivas.');
  for (const b of boletines) {
    if (!b.completo) advertencias.push(`${b.nombre_periodo}: faltan notas cerradas (${b.pendientes.join(', ') || 'sin detalle'}). El promedio de ese periodo y el acumulado no se calculan.`);
  }
  if (omitido) advertencias.push(`El estudiante salió durante «${omitido.nombre}», que no está cerrado: sus notas parciales no se incluyen porque el SIEE del colegio no autoriza exportar cortes.`);
  if (corte) advertencias.push(`Las notas de «${corte.nombre}» son un corte parcial a la fecha de salida: no son definitivas y no entran en el acumulado.`);

  const grupo = await Group.findById(matricula.group_id)
    .populate<{ sede_id: { nombre: string } | null; jornada_id: { nombre: string } | null; grade_id: { nombre: string } | null }>([
      { path: 'sede_id', select: 'nombre' },
      { path: 'jornada_id', select: 'nombre' },
      { path: 'grade_id', select: 'nombre' },
    ]);
  const base = boletines[0]?.institucion ?? (await institucionBasica());

  return {
    enrollment_id: String(matricula._id),
    estudiante: {
      id: String(estudiante._id),
      nombre_completo: `${estudiante.nombre} ${estudiante.apellido}`,
      documento: estudiante.numero_documento,
      grado: grupo?.grade_id?.nombre ?? '',
      grupo: grupo?.nomenclatura ?? '',
      sede: grupo?.sede_id?.nombre ?? '',
      jornada: grupo?.jornada_id?.nombre ?? '',
    },
    institucion: base,
    academic_year: anio.year,
    salida: {
      tipo: salida?.tipo ?? 'RETIRO',
      nombre_tipo: NOMBRES_TIPO_SALIDA[salida?.tipo ?? 'RETIRO'],
      fecha_efectiva: fechaEfectiva,
      institucion_receptora: salida?.institucion_receptora?.nombre ?? null,
    },
    periodos: oficiales.map((p, i) => ({ numero: p.numero, nombre: p.nombre, porcentaje: p.porcentaje, completo: boletines[i]?.completo ?? false, promedio: promediosPeriodo[i] ?? null })),
    periodo_corte: corte ? { numero: corte.numero, nombre: corte.nombre } : null,
    asignaturas: [...filas.values()].sort((a, b) => a.area.localeCompare(b.area, 'es') || a.nombre.localeCompare(b.nombre, 'es')),
    promedio_acumulado: promedioAcumulado,
    desempeno_acumulado: promedioAcumulado === null ? null : desempenoCualitativo(promedioAcumulado, anio.escala_evaluacion).etiqueta,
    asistencia: {
      fallas_justificadas: asistencia.total.fallas_justificadas,
      fallas_injustificadas: asistencia.total.fallas_injustificadas,
      retardos: asistencia.total.retardos,
    },
    escala: escala.rangos.map((r) => ({ nivel: r.nivel, etiqueta: r.etiqueta, valor_minimo: r.valor_minimo, valor_maximo: r.valor_maximo, es_aprobatorio: r.es_aprobatorio })),
    advertencias,
    completo,
  };
}

async function institucionBasica(): Promise<BoletinRetiro['institucion']> {
  const institucion = await Institution.findOne().select('nombre codigo_dane nit resolucion_aprobacion').lean();
  return {
    nombre: institucion?.nombre ?? '',
    codigo_dane: institucion?.codigo_dane ?? '',
    nit: institucion?.nit ?? '',
    resolucion_aprobacion: institucion?.resolucion_aprobacion ?? '',
  };
}

/**
 * El PDF es el documento que se entrega: si el SIEE del colegio lo condiciona, solo sale con el paz y salvo de salida aprobado. La consulta en
 * pantalla (`armarBoletinRetiro`) no se condiciona: es para revisar lo que se va a entregar.
 */
export async function exigirCondicionesDeEntrega(enrollmentId: string): Promise<void> {
  const configuracion = await leerConfiguracionBoletin();
  if (configuracion.exigir_paz_y_salvo_en_retiro) await exigirPazYSalvoDeSalidaAprobado(enrollmentId, 'Boletín parcial de retiro');
}

export async function registrarGeneracion(enrollmentId: string, usuario: UserDocument, ip?: string | null): Promise<void> {
  await registrarEvento({ usuario_id: usuario._id, accion: 'SALIDA_BOLETIN_PARCIAL_GENERADO', entidad: 'Enrollment', entidad_id: enrollmentId, ip });
}
