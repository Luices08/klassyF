import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { GRADOS_SERVICIO_SOCIAL, VERIFICACIONES_QUE_CUENTAN } from '../constants/titulacion';
import Enrollment from '../models/enrollment.model';
import Institution from '../models/institution.model';
import { RegistroServicioSocial } from '../models/registrosTitulacion.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ReporteTabular, nombreDeArchivo } from '../utils/reporteTabular';
import { FiltrosAlcance, GrupoDelAlcance, describirAlcance, gruposDelAlcance } from './alcanceReportes.service';
import { registrarEvento } from './audit.service';
import { calcularEstadisticas } from './attendanceStats.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { datosDePolitica, obtenerPolitica } from './politicaPromocion.service';
import { listarCandidatos } from './recuperacion.service';

export interface FiltrosListado extends FiltrosAlcance {
  academic_year_id: string;
}

const PUEDEN_CONSULTAR: string[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

function exigirAcceso(usuario: UserDocument): void {
  if (!PUEDEN_CONSULTAR.includes(usuario.rol)) throw new ApiError(403, 'Solo administración, coordinación y secretaría descargan este listado.');
}

const fecha = (d: Date | null | undefined): string => (d ? new Date(d).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const ESTADO_RECUPERACION: Record<string, string> = { PENDIENTE: 'Pendiente', SUPERADA: 'Superó', NO_SUPERADA: 'No superó' };

/**
 * Estudiantes que deben presentar la recuperación final (nivelación de cierre), con la asignatura pendiente y el docente responsable. Se calcula al
 * descargar con lo que M12 y M18 tienen hoy: antes de la recuperación sirve de apoyo para citar a las familias, y después muestra quién ya la superó.
 * Quien perdió más asignaturas de las que el colegio permite recuperar sigue en la lista, marcado sin derecho (así no desaparece de la vista del colegio).
 */
export async function reporteRecuperacionFinal(filtros: FiltrosListado, usuario: UserDocument, ip?: string | null): Promise<ReporteTabular> {
  exigirAcceso(usuario);
  const anio = await cargarAnio(filtros.academic_year_id);
  const grupos = await gruposDelAlcance(anio._id, filtros, usuario);
  const institucion = await Institution.findOne().select('nombre').lean();

  const base: Omit<ReporteTabular, 'leyenda' | 'resumen' | 'filas' | 'mensaje_vacio'> = {
    titulo: 'Estudiantes en recuperación final',
    institucion: institucion?.nombre ?? '',
    anio: anio.year,
    generado_en: new Date(),
    alcance: describirAlcance(grupos, filtros),
    columnas: [
      { clave: 'grupo', titulo: 'Grupo', ancho: 9 },
      { clave: 'documento', titulo: 'Documento', ancho: 14, texto: true },
      { clave: 'estudiante', titulo: 'Apellidos y nombres', ancho: 32 },
      { clave: 'asignatura', titulo: 'Asignatura pendiente', ancho: 26 },
      { clave: 'docente', titulo: 'Docente responsable', ancho: 28 },
      { clave: 'nota', titulo: 'Nota del año', ancho: 10, alinear: 'center' },
      { clave: 'estado', titulo: 'Estado', ancho: 10, alinear: 'center' },
      { clave: 'derecho', titulo: '¿Puede recuperar?', ancho: 30 },
    ],
    nombre_archivo: nombreDeArchivo('recuperacion-final', anio.year, filtros.group_id && grupos.length === 1 ? grupos[0]?.etiqueta : 'todos-los-grupos'),
  };

  const listados = [];
  for (const g of grupos) listados.push({ grupo: g, listado: await listarCandidatos({ tipo: 'ANUAL', academic_year_id: filtros.academic_year_id, group_id: String(g._id) }, usuario) });
  const sinPolitica = listados.find((l) => !l.listado.aplica);
  if (sinPolitica) {
    return {
      ...base,
      leyenda: 'Sin recuperación de fin de año según la política del colegio (SIEE).',
      resumen: [],
      filas: [],
      mensaje_vacio: sinPolitica.listado.motivo_no_aplica ?? 'El colegio no tiene recuperación de fin de año.',
    };
  }

  const asignacionIds = listados.flatMap((l) => l.listado.filas.map((f) => f.teacher_assignment_id));
  const asignaciones = await TeacherAssignment.find({ _id: { $in: asignacionIds } }).select('docente_id').lean();
  const docentes = await User.find({ _id: { $in: asignaciones.map((a) => a.docente_id) } }).select('nombre apellido').lean();
  const docentePorId = new Map(docentes.map((d) => [String(d._id), `${d.apellido} ${d.nombre}`]));
  const docenteDeAsignacion = new Map(asignaciones.map((a) => [String(a._id), docentePorId.get(String(a.docente_id)) ?? '']));

  const filas = listados.flatMap(({ grupo, listado }) =>
    listado.filas.map((f) => ({
      grupo: grupo.etiqueta,
      documento: f.estudiante.numero_documento,
      estudiante: `${f.estudiante.apellido} ${f.estudiante.nombre}`,
      asignatura: f.asignatura,
      docente: docenteDeAsignacion.get(f.teacher_assignment_id) ?? '',
      nota: f.nota_original,
      estado: ESTADO_RECUPERACION[f.estado] ?? f.estado,
      derecho: f.habilitado ? `Sí (${f.intentos_restantes} intento${f.intentos_restantes === 1 ? '' : 's'})` : `No: ${f.motivo_no_habilitado ?? ''}`,
    }))
  );
  const ventana = listados[0]?.listado.ventana ?? null;
  const textoVentana = ventana?.abierta
    ? `La recuperación final está abierta${ventana.hasta ? ` hasta el ${fecha(ventana.hasta)}` : ''}.`
    : ventana?.motivo
      ? `Ventana de recuperación final: ${ventana.motivo}`
      : '';

  await registrarEvento({ usuario_id: usuario._id, accion: 'REPORTE_CIERRE_GENERADO', entidad: 'AcademicYear', entidad_id: anio._id, detalle: `Estudiantes en recuperación final: ${filas.length} fila(s)`, ip });
  return {
    ...base,
    leyenda: `Se calcula al descargar con las notas cerradas y las recuperaciones registradas hasta hoy; quien ya la superó o agotó los intentos sigue en la lista, marcado. ${textoVentana}`.trim(),
    resumen: [
      ['Estudiantes', new Set(filas.map((f) => f.documento)).size],
      ['Asignaturas pendientes', filas.filter((f) => f.estado === 'Pendiente').length],
      ['Con derecho a recuperar', listados.reduce((s, l) => s + l.listado.filas.filter((f) => f.habilitado).length, 0)],
      ['Sin derecho', filas.filter((f) => f.derecho.startsWith('No')).length],
    ],
    filas,
    mensaje_vacio: 'Ningún estudiante del alcance elegido tiene asignaturas por recuperar al final del año.',
  };
}

/**
 * Estudiantes retirados o trasladados durante el año, con el motivo, la fecha efectiva, dónde siguen (si fue traslado) y las inasistencias acumuladas
 * hasta ese día. Los datos son los de la salida registrada en M04: aquí solo se listan. Una matrícula retirada antes de que existiera la salida
 * registrada sale sin fecha ni motivo.
 */
export async function reporteRetirados(filtros: FiltrosListado, usuario: UserDocument, ip?: string | null): Promise<ReporteTabular> {
  exigirAcceso(usuario);
  const anio = await cargarAnio(filtros.academic_year_id);
  const grupos = await gruposDelAlcance(anio._id, filtros, usuario);
  const institucion = await Institution.findOne().select('nombre').lean();
  const grupoPor = new Map<string, GrupoDelAlcance>(grupos.map((g) => [String(g._id), g]));

  const matriculas = await Enrollment.find({ academic_year_id: anio._id, estado: 'RETIRADO', group_id: { $in: grupos.map((g) => g._id) } }).lean();
  const usuarios = await User.find({ _id: { $in: matriculas.map((m) => m.student_id) } }).select('nombre apellido numero_documento').lean();
  const usuarioPor = new Map(usuarios.map((u) => [String(u._id), u]));

  const filas = [];
  for (const m of matriculas) {
    const u = usuarioPor.get(String(m.student_id));
    const grupo = grupoPor.get(String(m.group_id));
    const salida = m.salida;
    const fallas = (await calcularEstadisticas({ academic_year_id: filtros.academic_year_id, agrupar_por: 'estudiante', student_id: String(m.student_id), hasta: salida?.fecha_efectiva }, null)).total;
    filas.push({
      fecha: salida ? fecha(salida.fecha_efectiva) : '',
      orden: salida ? new Date(salida.fecha_efectiva).getTime() : 0,
      grupo: grupo?.etiqueta ?? '',
      documento: u?.numero_documento ?? '',
      estudiante: u ? `${u.apellido} ${u.nombre}` : '',
      tipo: salida ? (salida.tipo === 'TRASLADO' ? 'Traslado' : 'Retiro') : 'Retiro (sin registro)',
      motivo: salida?.motivo ?? '',
      recibe: salida?.institucion_receptora ? [salida.institucion_receptora.nombre, salida.institucion_receptora.municipio].filter(Boolean).join(' · ') : '',
      justificadas: fallas.fallas_justificadas,
      injustificadas: fallas.fallas_injustificadas,
    });
  }
  filas.sort((a, b) => a.orden - b.orden || a.estudiante.localeCompare(b.estudiante, 'es'));

  await registrarEvento({ usuario_id: usuario._id, accion: 'REPORTE_CIERRE_GENERADO', entidad: 'AcademicYear', entidad_id: anio._id, detalle: `Retirados y trasladados: ${filas.length} fila(s)`, ip });
  return {
    titulo: 'Estudiantes retirados y trasladados',
    institucion: institucion?.nombre ?? '',
    anio: anio.year,
    generado_en: new Date(),
    alcance: describirAlcance(grupos, filtros),
    leyenda: 'Se calcula al descargar con las salidas registradas hasta hoy. Las inasistencias se cuentan hasta la fecha efectiva de cada salida.',
    resumen: [
      ['Retirados y trasladados', filas.length],
      ['Retiros', filas.filter((f) => f.tipo.startsWith('Retiro')).length],
      ['Traslados', filas.filter((f) => f.tipo === 'Traslado').length],
    ],
    columnas: [
      { clave: 'fecha', titulo: 'Fecha de salida', ancho: 16 },
      { clave: 'grupo', titulo: 'Grupo', ancho: 9 },
      { clave: 'documento', titulo: 'Documento', ancho: 14, texto: true },
      { clave: 'estudiante', titulo: 'Apellidos y nombres', ancho: 32 },
      { clave: 'tipo', titulo: 'Tipo', ancho: 14 },
      { clave: 'motivo', titulo: 'Motivo', ancho: 36 },
      { clave: 'recibe', titulo: 'Institución que lo recibe', ancho: 30 },
      { clave: 'justificadas', titulo: 'Fallas justif.', ancho: 10, alinear: 'center' },
      { clave: 'injustificadas', titulo: 'Fallas injustif.', ancho: 10, alinear: 'center' },
    ],
    filas,
    mensaje_vacio: 'No hay estudiantes retirados ni trasladados en el alcance elegido.',
    nombre_archivo: nombreDeArchivo('retirados', anio.year, filtros.group_id && grupos.length === 1 ? grupos[0]?.etiqueta : 'todos-los-grupos'),
  };
}

/**
 * Consolidado del servicio social de décimo y once: por estudiante, la entidad receptora, las horas con soporte verificado, las que aún están por
 * verificar y si cumple lo que exige el colegio (Aprobado / Pendiente). Son las mismas horas de la titulación (M26): solo cuentan las verificadas o
 * heredadas y una tanda anulada o rechazada no suma. Si el colegio no exige horas, el estado dice «No se exige» en lugar de inventar un cumplimiento.
 */
export async function reporteServicioSocial(filtros: FiltrosListado, usuario: UserDocument, ip?: string | null): Promise<ReporteTabular> {
  exigirAcceso(usuario);
  const anio = await cargarAnio(filtros.academic_year_id);
  const todos = await gruposDelAlcance(anio._id, filtros, usuario);
  const grupos = todos.filter((g) => GRADOS_SERVICIO_SOCIAL.includes(g.gradoNumero));
  const institucion = await Institution.findOne().select('nombre').lean();
  const politica = datosDePolitica(await obtenerPolitica(filtros.academic_year_id)).titulacion.servicio_social;
  const exigidas = politica.activo ? politica.horas_requeridas : null;

  const matriculas = await Enrollment.find({ academic_year_id: anio._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS }, group_id: { $in: grupos.map((g) => g._id) } }).select('student_id group_id').lean();
  const ids = matriculas.map((m) => m.student_id);
  const [usuarios, registros] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('nombre apellido numero_documento').lean(),
    RegistroServicioSocial.find({ student_id: { $in: ids }, estado: 'VIGENTE' }).sort({ createdAt: 1 }).lean(),
  ]);
  const usuarioPor = new Map(usuarios.map((u) => [String(u._id), u]));
  const grupoPor = new Map(grupos.map((g) => [String(g._id), g]));
  const registrosPor = new Map<string, typeof registros>();
  for (const r of registros) registrosPor.set(String(r.student_id), [...(registrosPor.get(String(r.student_id)) ?? []), r]);

  const redondear = (n: number) => Math.round(n * 100) / 100;
  const filas = matriculas
    .map((m) => {
      const u = usuarioPor.get(String(m.student_id));
      const grupo = grupoPor.get(String(m.group_id));
      const suyos = registrosPor.get(String(m.student_id)) ?? [];
      const verificadas = redondear(suyos.filter((r) => VERIFICACIONES_QUE_CUENTAN.includes(r.verificacion ?? 'HEREDADO')).reduce((s, r) => s + r.horas, 0));
      const porVerificar = redondear(suyos.filter((r) => r.verificacion === 'PENDIENTE').reduce((s, r) => s + r.horas, 0));
      const entidades = suyos
        .filter((r) => r.verificacion !== 'RECHAZADO')
        .map((r) => `${r.entidad} (${r.horas} h${r.verificacion === 'PENDIENTE' ? ', por verificar' : ''})`)
        .join('; ');
      return {
        orden: grupo?.gradoNumero ?? 0,
        grupo: grupo?.etiqueta ?? '',
        documento: u?.numero_documento ?? '',
        estudiante: u ? `${u.apellido} ${u.nombre}` : '',
        entidad: entidades,
        verificadas,
        por_verificar: porVerificar,
        exigidas,
        faltan: exigidas === null ? null : Math.max(0, redondear(exigidas - verificadas)),
        estado: exigidas === null ? 'No se exige' : verificadas >= exigidas ? 'Aprobado' : 'Pendiente',
      };
    })
    .sort((a, b) => a.orden - b.orden || a.grupo.localeCompare(b.grupo, 'es') || a.estudiante.localeCompare(b.estudiante, 'es'));

  await registrarEvento({ usuario_id: usuario._id, accion: 'REPORTE_CIERRE_GENERADO', entidad: 'AcademicYear', entidad_id: anio._id, detalle: `Servicio social 10° y 11°: ${filas.length} fila(s)`, ip });
  return {
    titulo: 'Servicio social estudiantil (décimo y once)',
    institucion: institucion?.nombre ?? '',
    anio: anio.year,
    generado_en: new Date(),
    alcance: describirAlcance(todos, filtros),
    leyenda: `Se calcula al descargar. Solo suman las horas con soporte verificado; las que están por verificar se muestran aparte. ${exigidas === null ? 'El colegio no exige un mínimo de horas.' : `El colegio exige ${exigidas} horas.`}`,
    resumen: [
      ['Estudiantes', filas.length],
      ['Aprobado', filas.filter((f) => f.estado === 'Aprobado').length],
      ['Pendiente', filas.filter((f) => f.estado === 'Pendiente').length],
      ['Horas por verificar', redondear(filas.reduce((s, f) => s + f.por_verificar, 0))],
    ],
    columnas: [
      { clave: 'grupo', titulo: 'Grupo', ancho: 9 },
      { clave: 'documento', titulo: 'Documento', ancho: 14, texto: true },
      { clave: 'estudiante', titulo: 'Apellidos y nombres', ancho: 30 },
      { clave: 'entidad', titulo: 'Entidad receptora', ancho: 42 },
      { clave: 'verificadas', titulo: 'Horas verificadas', ancho: 11, alinear: 'center' },
      { clave: 'por_verificar', titulo: 'Por verificar', ancho: 11, alinear: 'center' },
      { clave: 'exigidas', titulo: 'Exigidas', ancho: 9, alinear: 'center' },
      { clave: 'faltan', titulo: 'Faltan', ancho: 8, alinear: 'center' },
      { clave: 'estado', titulo: 'Estado', ancho: 12, alinear: 'center' },
    ],
    filas,
    mensaje_vacio: 'No hay estudiantes de décimo ni de once con matrícula activa en el alcance elegido.',
    nombre_archivo: nombreDeArchivo('servicio-social', anio.year, filtros.group_id && grupos.length === 1 ? grupos[0]?.etiqueta : 'todos-los-grupos'),
  };
}
