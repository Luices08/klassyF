import { Types } from 'mongoose';
import { avisarPlanEnRevision, avisarPlanRevisado } from './notificacionesEventos.service';
import { NivelEducativo } from '../constants/enums';
import { EstadoPlanVista, MAX_COMENTARIO_REVISION, NOMBRES_ESTADO_PLAN } from '../constants/planeacion';
import { ROLES } from '../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import PlanAula, { PlanAulaDocument } from '../models/planAula.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { PdfSubido, borrarArchivo, copiarPdf, guardarPdf, rutaAbsoluta } from '../utils/almacenPlaneacion';
import { PlanAreaDeClase, planAreaDeClase } from '../utils/liderArea';
import { ContextoPlaneacion, permisoPlaneacion } from '../utils/permisosPlaneacion';
import {
  CodigoBloqueoCarga,
  bloqueoDeCargaPlanAula,
  estadoDeVentana,
  evaluarRadicacion,
  planesAdoptables,
  siguienteEstado,
  ventanaDeEntrega,
} from '../utils/planeacion';
import { carpetaPlanAula } from '../utils/uploadPaths';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { registrarEvento } from './audit.service';
import { CoberturaDelAnio, cargarCoberturas } from './planeacionCobertura.service';
import { ClaseAgrupada, claveDeClase, clasesActivasAgrupadas, clavesConClaseActiva } from './planeacionContexto.service';
import { PersonaVista, cargarPersonas, personasDePlan, resumenDePlan, textoDeDia, vistaRevision, vistaVersion } from './planeacionVista.service';
import { RevisarPlanInput } from './planArea.service';

export interface RadicarPlanAulaInput {
  academic_year_id: string;
  periodo_numero: number;
  subject_id: string;
  grade_id: string;
  titulo: string;
  descripcion: string;
}

export interface FiltroBandeja {
  academic_year_id: string;
  periodo_numero?: number;
  area_id?: string;
  grade_id?: string;
  docente_id?: string;
  estado?: EstadoPlanVista;
}

interface AsignaturaConArea {
  _id: Types.ObjectId;
  nombre: string;
  area_id: { _id: Types.ObjectId; nombre: string; codigo: string };
}

interface GradoVista {
  _id: Types.ObjectId;
  nombre: string;
  numero: number;
  nivel: NivelEducativo;
}

// --- Cargas de apoyo ---

async function cargarAnio(id: string): Promise<AcademicYearDocument> {
  const anio = await AcademicYear.findById(id);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  return anio;
}

function exigirPeriodo(anio: AcademicYearDocument, numero: number): void {
  if (!anio.periodos.some((p) => p.numero === numero)) throw new ApiError(400, `El año lectivo ${anio.year} no tiene periodo ${numero}.`);
}

async function catalogos(subjectIds: Array<string | Types.ObjectId>, gradeIds: Array<string | Types.ObjectId>) {
  const [asignaturas, grados] = await Promise.all([
    Subject.find({ _id: { $in: [...new Set(subjectIds.map(String))] } })
      .select('nombre area_id')
      .populate('area_id', 'nombre codigo')
      .lean(),
    Grade.find({ _id: { $in: [...new Set(gradeIds.map(String))] } })
      .select('nombre numero nivel')
      .lean(),
  ]);
  return {
    asignaturas: new Map((asignaturas as unknown as AsignaturaConArea[]).map((s) => [String(s._id), s])),
    grados: new Map((grados as unknown as GradoVista[]).map((g) => [String(g._id), g])),
  };
}

/**
 * El plan de área que aplica a una clase: el del líder que cubre el nivel del grado, la jornada (diurna o nocturna) y la sede de
 * los grupos donde se dicta. Una clase solo queda habilitada si todos los líderes que la tocan tienen su plan aprobado.
 */
function planAreaDeLaClase(coberturas: readonly CoberturaDelAnio[], areaId: string, grado: GradoVista, clase: Pick<ClaseAgrupada, 'ubicaciones'>): PlanAreaDeClase {
  return planAreaDeClase(
    coberturas.filter((c) => c.area_id === areaId),
    grado.nivel,
    clase.ubicaciones
  );
}

const vistaGrado = (g: GradoVista) => ({ _id: String(g._id), nombre: g.nombre, numero: g.numero });
const vistaAsignatura = (s: AsignaturaConArea) => ({ _id: String(s._id), nombre: s.nombre });
const vistaArea = (s: AsignaturaConArea) => ({ _id: String(s.area_id._id), nombre: s.area_id.nombre });

function resumenPlanAula(plan: Parameters<typeof resumenDePlan>[0] & { periodo_numero: number; radicacion: PlanAulaDocument['radicacion'] }, personas: Map<string, PersonaVista>) {
  return {
    ...resumenDePlan(plan, personas),
    periodo_numero: plan.periodo_numero,
    radicacion: { fecha: plan.radicacion.fecha, fecha_limite: plan.radicacion.fecha_limite, fuera_de_plazo: plan.radicacion.fuera_de_plazo },
  };
}

function mensajeDeBloqueo(codigo: CodigoBloqueoCarga, datos: { area: string; apertura?: Date; detalle?: string | null }): string {
  switch (codigo) {
    case 'ANIO_CERRADO':
      return 'El año lectivo está cerrado: solo admite consulta.';
    case 'PLAN_AREA_PENDIENTE':
      return `El plan de área de ${datos.area} todavía no está aprobado${datos.detalle ? ` (${datos.detalle})` : ''}. Cuando coordinación lo apruebe podrás cargar tu plan de aula.`;
    case 'EN_REVISION':
      return 'Tu plan de aula está en revisión de coordinación.';
    case 'APROBADO':
      return 'Tu plan de aula ya está aprobado.';
    case 'VENTANA_NO_ABIERTA':
      return `La entrega de este periodo abre el ${datos.apertura ? textoDeDia(datos.apertura) : 'día que defina coordinación'}.`;
  }
}

// --- Vista del docente: tarjetas por asignatura y grado ---

/**
 * Las tarjetas del docente: una por asignatura y grado que dicta (el plan es por grado, no por grupo), cada una con sus periodos.
 * Para cada periodo viene todo ya resuelto en el servidor: el plan, la ventana de entrega, si puede cargar (y si no, por qué) y
 * los planes aprobados de un docente anterior que puede adoptar.
 */
export async function misPlanesDeAula(anioId: string, docente: UserDocument) {
  const anio = await cargarAnio(anioId);
  const ahora = new Date();
  const clases = await clasesActivasAgrupadas({ academic_year_id: anio._id, docente_id: docente._id });
  if (clases.length === 0) return { anio: { _id: String(anio._id), year: anio.year, estado: anio.estado }, tarjetas: [] };

  const subjectIds = [...new Set(clases.map((c) => c.subject_id))];
  const gradeIds = [...new Set(clases.map((c) => c.grade_id))];
  const { asignaturas, grados } = await catalogos(subjectIds, gradeIds);
  const areaIds = [...new Set([...asignaturas.values()].map((s) => String(s.area_id._id)))];

  const [misPlanes, candidatos, coberturas, conClase] = await Promise.all([
    PlanAula.find({ academic_year_id: anio._id, docente_id: docente._id }).lean(),
    PlanAula.find({
      academic_year_id: anio._id,
      estado: 'APROBADO',
      docente_id: { $ne: docente._id },
      subject_id: { $in: subjectIds },
      grade_id: { $in: gradeIds },
    }).lean(),
    cargarCoberturas(anio._id, areaIds),
    clavesConClaseActiva(anio._id, subjectIds),
  ]);
  const personas = await cargarPersonas([...misPlanes.flatMap(personasDePlan), ...candidatos.flatMap(personasDePlan), ...candidatos.map((c) => c.docente_id)]);
  const anioCerrado = anio.estado === 'CERRADO';

  const tarjetas = clases
    .map((clase) => {
      const asignatura = asignaturas.get(clase.subject_id);
      const grado = grados.get(clase.grade_id);
      if (!asignatura || !grado) return null;

      const planAreaClase = planAreaDeLaClase(coberturas, String(asignatura.area_id._id), grado, clase);
      const estadoPlanArea = planAreaClase.estado;
      const periodos = [...anio.periodos]
        .sort((a, b) => a.numero - b.numero)
        .map((periodo) => {
          const ventana = ventanaDeEntrega(anio.periodos, periodo.numero);
          const estadoVentana = ventana ? estadoDeVentana(ventana, ahora) : null;
          const plan = misPlanes.find((p) => String(p.subject_id) === clase.subject_id && String(p.grade_id) === clase.grade_id && p.periodo_numero === periodo.numero);
          const estado: EstadoPlanVista = plan?.estado ?? 'SIN_CARGAR';
          const bloqueo = bloqueoDeCargaPlanAula({ anioCerrado, planAreaEstado: estadoPlanArea, planAulaEstado: estado, ventana: estadoVentana });
          // Para avisar antes de radicar: con la misma regla del servidor, ¿saldría hoy marcado como fuera de plazo?
          const radicariaFueraDePlazo = estado === 'SIN_CARGAR' && evaluarRadicacion(ahora, ventana, clase.asignado_desde).fuera_de_plazo;

          const adoptables =
            estado === 'SIN_CARGAR' && estadoPlanArea === 'APROBADO' && !anioCerrado
              ? planesAdoptables(
                  candidatos
                    .filter((c) => String(c.subject_id) === clase.subject_id && String(c.grade_id) === clase.grade_id && c.periodo_numero === periodo.numero)
                    .map((c) => ({ plan: c, docente_id: String(c.docente_id), estado: c.estado, archivado: !conClase.has(claveDeClase(c.docente_id, c.subject_id, c.grade_id)) })),
                  String(docente._id)
                ).map(({ plan: c }) => ({
                  plan_id: String(c._id),
                  docente: personas.get(String(c.docente_id)) ?? null,
                  titulo: c.versiones.at(-1)?.titulo ?? '',
                  descripcion: c.versiones.at(-1)?.descripcion ?? '',
                  aprobado_en: c.revisiones.filter((r) => r.accion === 'APROBADO').at(-1)?.fecha ?? null,
                }))
              : [];

          return {
            numero: periodo.numero,
            nombre: periodo.nombre,
            ventana: ventana ? { apertura: ventana.apertura, limite: ventana.limite, estado: estadoVentana } : null,
            estado,
            plan: plan ? resumenPlanAula(plan, personas) : null,
            puede_cargar: bloqueo === null,
            radicaria_fuera_de_plazo: radicariaFueraDePlazo,
            bloqueo: bloqueo
              ? { codigo: bloqueo, mensaje: mensajeDeBloqueo(bloqueo, { area: asignatura.area_id.nombre, apertura: ventana?.apertura, detalle: planAreaClase.detalle }) }
              : null,
            adoptables,
          };
        });

      return {
        area: vistaArea(asignatura),
        asignatura: vistaAsignatura(asignatura),
        grado: vistaGrado(grado),
        grupos: clase.grupos,
        // Casi siempre es un solo plan de área; son varios si los grupos del docente caen bajo líderes distintos (p. ej. diurna y nocturna).
        plan_area: { area_id: String(asignatura.area_id._id), estado: estadoPlanArea, planes_aprobados_ids: planAreaClase.planes_aprobados_ids, detalle: planAreaClase.detalle },
        periodos,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .sort(
      (a, b) =>
        a.area.nombre.localeCompare(b.area.nombre, 'es') || a.asignatura.nombre.localeCompare(b.asignatura.nombre, 'es') || a.grado.numero - b.grado.numero
    );

  return { anio: { _id: String(anio._id), year: anio.year, estado: anio.estado }, tarjetas };
}

// --- Bandeja de coordinación: cobertura por docente, asignatura, grado y periodo ---

/**
 * Lo que coordinación necesita para dar seguimiento: una fila por cada plan que se espera (docente × asignatura × grado × periodo,
 * con la carga docente de M08) y, aparte, los planes archivados de docentes que ya no dictan esa asignatura en ese grado.
 */
export async function bandejaPlanesDeAula(filtro: FiltroBandeja, usuario: UserDocument) {
  const anio = await cargarAnio(filtro.academic_year_id);
  const ahora = new Date();
  const periodos = [...anio.periodos].filter((p) => !filtro.periodo_numero || p.numero === filtro.periodo_numero).sort((a, b) => a.numero - b.numero);

  const [clases, planes] = await Promise.all([
    clasesActivasAgrupadas({ academic_year_id: anio._id, docente_id: filtro.docente_id }),
    PlanAula.find({
      academic_year_id: anio._id,
      ...(filtro.periodo_numero ? { periodo_numero: filtro.periodo_numero } : {}),
      ...(filtro.docente_id ? { docente_id: filtro.docente_id } : {}),
      ...(filtro.grade_id ? { grade_id: filtro.grade_id } : {}),
    }).lean(),
  ]);

  const subjectIds = [...new Set([...clases.map((c) => c.subject_id), ...planes.map((p) => String(p.subject_id))])];
  const gradeIds = [...new Set([...clases.map((c) => c.grade_id), ...planes.map((p) => String(p.grade_id))])];
  const { asignaturas, grados } = await catalogos(subjectIds, gradeIds);
  const [activas, personas] = await Promise.all([
    clavesConClaseActiva(anio._id, subjectIds),
    cargarPersonas([...planes.flatMap(personasDePlan), ...planes.map((p) => p.docente_id), ...clases.map((c) => c.docente_id)]),
  ]);

  const planDe = new Map(planes.map((p) => [`${claveDeClase(p.docente_id, p.subject_id, p.grade_id)}|${p.periodo_numero}`, p]));
  const anioCerrado = anio.estado === 'CERRADO';
  const contextoGestion: ContextoPlaneacion = {};

  const fila = (docenteId: string, subjectId: string, gradeId: string, grupos: string[], periodo: { numero: number; nombre: string }, plan: (typeof planes)[number] | undefined, archivado: boolean) => {
    const asignatura = asignaturas.get(subjectId);
    const grado = grados.get(gradeId);
    if (!asignatura || !grado) return null;
    if (filtro.area_id && String(asignatura.area_id._id) !== filtro.area_id) return null;

    const estado: EstadoPlanVista = plan?.estado ?? 'SIN_CARGAR';
    const ventana = ventanaDeEntrega(anio.periodos, periodo.numero);
    return {
      clave: `${claveDeClase(docenteId, subjectId, gradeId)}|${periodo.numero}`,
      docente: personas.get(docenteId) ?? null,
      area: vistaArea(asignatura),
      asignatura: vistaAsignatura(asignatura),
      grado: vistaGrado(grado),
      grupos,
      periodo_numero: periodo.numero,
      periodo_nombre: periodo.nombre,
      ventana: ventana ? { apertura: ventana.apertura, limite: ventana.limite, estado: estadoDeVentana(ventana, ahora) } : null,
      estado,
      plan: plan ? resumenPlanAula(plan, personas) : null,
      archivado,
      puede: {
        revisar: !anioCerrado && estado === 'EN_REVISION' && permisoPlaneacion(usuario.rol, contextoGestion, 'REVISAR_PLAN'),
        reabrir: !anioCerrado && estado === 'APROBADO' && permisoPlaneacion(usuario.rol, contextoGestion, 'REABRIR_PLAN'),
      },
    };
  };

  const esperadas = clases
    .filter((c) => !filtro.grade_id || c.grade_id === filtro.grade_id)
    .flatMap((c) => periodos.map((p) => fila(c.docente_id, c.subject_id, c.grade_id, c.grupos, p, planDe.get(`${claveDeClase(c.docente_id, c.subject_id, c.grade_id)}|${p.numero}`), false)));

  // Archivado: el dueño del plan ya no dicta esa asignatura en ese grado (`activas` mira toda la carga, no solo el filtro).
  const archivadas = planes
    .filter((p) => !activas.has(claveDeClase(p.docente_id, p.subject_id, p.grade_id)))
    .map((p) => {
      const periodo = periodos.find((x) => x.numero === p.periodo_numero);
      return periodo ? fila(String(p.docente_id), String(p.subject_id), String(p.grade_id), [], periodo, p, true) : null;
    });

  const todas = [...esperadas, ...archivadas]
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .sort(
      (a, b) =>
        a.area.nombre.localeCompare(b.area.nombre, 'es') ||
        a.asignatura.nombre.localeCompare(b.asignatura.nombre, 'es') ||
        a.grado.numero - b.grado.numero ||
        `${a.docente?.apellido ?? ''} ${a.docente?.nombre ?? ''}`.localeCompare(`${b.docente?.apellido ?? ''} ${b.docente?.nombre ?? ''}`, 'es') ||
        a.periodo_numero - b.periodo_numero
    );

  // El resumen cuenta todo lo que pasa los demás filtros: si también respetara el estado, los contadores cambiarían al filtrar por ellos.
  const vigentes = todas.filter((f) => !f.archivado);
  const filas = filtro.estado ? todas.filter((f) => f.estado === filtro.estado) : todas;
  return {
    anio: { _id: String(anio._id), year: anio.year, estado: anio.estado },
    resumen: {
      esperados: vigentes.length,
      sin_cargar: vigentes.filter((f) => f.estado === 'SIN_CARGAR').length,
      en_revision: vigentes.filter((f) => f.estado === 'EN_REVISION').length,
      aprobados: vigentes.filter((f) => f.estado === 'APROBADO').length,
      devueltos: vigentes.filter((f) => f.estado === 'DEVUELTO').length,
      fuera_de_plazo: vigentes.filter((f) => f.plan?.radicacion.fuera_de_plazo).length,
      archivados: todas.length - vigentes.length,
    },
    filas,
  };
}

// --- Detalle y permisos sobre un plan puntual ---

/** El plan está archivado cuando su dueño ya no dicta esa asignatura en ese grado; el contexto resuelve además qué relación tiene quien consulta. */
async function contextoDelPlan(plan: PlanAulaDocument, usuario: UserDocument): Promise<{ contexto: ContextoPlaneacion; archivado: boolean }> {
  const [activas, clases] = await Promise.all([
    clavesConClaseActiva(plan.academic_year_id, [plan.subject_id]),
    usuario.rol === ROLES.DOCENTE ? clasesActivasAgrupadas({ academic_year_id: plan.academic_year_id, docente_id: usuario._id }) : Promise.resolve([]),
  ]);
  const archivado = !activas.has(claveDeClase(plan.docente_id, plan.subject_id, plan.grade_id));
  return {
    archivado,
    contexto: {
      esDuenioDelPlan: String(plan.docente_id) === String(usuario._id),
      imparteLaAsignaturaYGrado: clases.some((c) => c.subject_id === String(plan.subject_id) && c.grade_id === String(plan.grade_id)),
      planArchivado: archivado,
      estadoPlan: plan.estado,
    },
  };
}

async function cargarPlanVisible(id: string, usuario: UserDocument) {
  const plan = await PlanAula.findById(id);
  if (!plan) throw new ApiError(404, 'Plan de aula no encontrado.');
  const { contexto, archivado } = await contextoDelPlan(plan, usuario);
  if (!permisoPlaneacion(usuario.rol, contexto, 'VER_PLAN_AULA')) throw new ApiError(404, 'Plan de aula no encontrado.');
  return { plan, contexto, archivado };
}

/** Detalle de un plan de aula: versiones, historial de revisión con comentarios, la etiqueta de plazo y qué puede hacer quien lo consulta. */
export async function obtenerPlanDeAula(id: string, usuario: UserDocument) {
  const { plan, contexto, archivado } = await cargarPlanVisible(id, usuario);
  const anio = await cargarAnio(String(plan.academic_year_id));
  const { asignaturas, grados } = await catalogos([plan.subject_id], [plan.grade_id]);
  const asignatura = asignaturas.get(String(plan.subject_id));
  const grado = grados.get(String(plan.grade_id));
  const personas = await cargarPersonas([...personasDePlan(plan), plan.docente_id]);
  const anioCerrado = anio.estado === 'CERRADO';

  return {
    ...resumenPlanAula(plan, personas),
    academic_year_id: String(plan.academic_year_id),
    anio: anio.year,
    docente: personas.get(String(plan.docente_id)) ?? null,
    area: asignatura ? vistaArea(asignatura) : null,
    asignatura: asignatura ? vistaAsignatura(asignatura) : null,
    grado: grado ? vistaGrado(grado) : null,
    archivado,
    versiones: plan.versiones.map((v) => vistaVersion(v, personas)),
    revisiones: plan.revisiones.map((r) => vistaRevision(r, personas)),
    puede: {
      revisar: !anioCerrado && plan.estado === 'EN_REVISION' && permisoPlaneacion(usuario.rol, contexto, 'REVISAR_PLAN'),
      reabrir: !anioCerrado && plan.estado === 'APROBADO' && permisoPlaneacion(usuario.rol, contexto, 'REABRIR_PLAN'),
      ver_archivo: permisoPlaneacion(usuario.rol, contexto, 'VER_PLAN_AULA'),
    },
  };
}

/**
 * El plan de aula de una de las clases del docente en un periodo, para el visor del formulario de actividades (M11): si está
 * aprobado y, si no, qué falta. Coordinación lo consulta con la asignación de cualquier docente.
 */
export async function planDeAulaDeAsignacion(asignacionId: string, periodo: number, usuario: UserDocument) {
  const asignacion = await TeacherAssignment.findById(asignacionId);
  if (!asignacion) throw new ApiError(404, 'Asignación académica no encontrada.');
  if (usuario.rol === ROLES.DOCENTE && String(asignacion.docente_id) !== String(usuario._id)) {
    throw new ApiError(403, 'Solo puedes consultar el plan de aula de tus propias clases.');
  }
  if (asignacion.tipo_asignacion !== 'CLASE' || !asignacion.group_id || !asignacion.subject_id) {
    throw new ApiError(400, 'El plan de aula solo aplica a asignaciones de tipo CLASE.');
  }
  const grupo = await Group.findById(asignacion.group_id).select('grade_id').lean();
  if (!grupo) throw new ApiError(404, 'Grupo de la asignación académica no encontrado.');

  const plan = await PlanAula.findOne({
    academic_year_id: asignacion.academic_year_id,
    periodo_numero: periodo,
    subject_id: asignacion.subject_id,
    grade_id: grupo.grade_id,
    docente_id: asignacion.docente_id,
  });
  const estado: EstadoPlanVista = plan?.estado ?? 'SIN_CARGAR';
  const personas = plan ? await cargarPersonas(personasDePlan(plan)) : new Map<string, PersonaVista>();
  return {
    periodo_numero: periodo,
    estado,
    aprobado: estado === 'APROBADO',
    plan: plan ? resumenPlanAula(plan, personas) : null,
  };
}

// --- Radicar ---

/**
 * El docente radica su plan de aula del periodo (la primera vez) o la corrección de uno devuelto. La fecha límite no cierra el
 * formulario: radicar después queda marcado «entregado fuera de plazo» con fecha y hora. Un plan devuelto se puede corregir
 * siempre, hasta que se apruebe. Lo que sí exige es el plan de área aprobado y que el periodo ya haya abierto su entrega.
 */
export async function radicarPlanDeAula(input: RadicarPlanAulaInput, archivo: PdfSubido | undefined, docente: UserDocument, ip?: string | null) {
  const anio = await cargarAnio(input.academic_year_id);
  exigirPeriodo(anio, input.periodo_numero);

  const clases = await clasesActivasAgrupadas({ academic_year_id: anio._id, docente_id: docente._id });
  const clase = clases.find((c) => c.subject_id === input.subject_id && c.grade_id === input.grade_id);
  if (!clase) throw new ApiError(403, 'No tienes asignada esta asignatura en este grado: solo quien la dicta radica su plan de aula.');

  const { asignaturas, grados } = await catalogos([input.subject_id], [input.grade_id]);
  const asignatura = asignaturas.get(input.subject_id);
  const grado = grados.get(input.grade_id);
  if (!asignatura || !grado) throw new ApiError(404, 'Asignatura o grado no encontrados.');

  const llave = {
    academic_year_id: anio._id,
    periodo_numero: input.periodo_numero,
    subject_id: new Types.ObjectId(input.subject_id),
    grade_id: new Types.ObjectId(input.grade_id),
    docente_id: docente._id,
  };
  const [existente, coberturas] = await Promise.all([PlanAula.findOne(llave), cargarCoberturas(anio._id, [asignatura.area_id._id])]);
  const planAreaClase = planAreaDeLaClase(coberturas, String(asignatura.area_id._id), grado, clase);

  const ahora = new Date();
  const ventana = ventanaDeEntrega(anio.periodos, input.periodo_numero);
  const estado: EstadoPlanVista = existente?.estado ?? 'SIN_CARGAR';
  const bloqueo = bloqueoDeCargaPlanAula({
    anioCerrado: anio.estado === 'CERRADO',
    planAreaEstado: planAreaClase.estado,
    planAulaEstado: estado,
    ventana: ventana ? estadoDeVentana(ventana, ahora) : null,
  });
  if (bloqueo) throw new ApiError(409, mensajeDeBloqueo(bloqueo, { area: asignatura.area_id.nombre, apertura: ventana?.apertura, detalle: planAreaClase.detalle }));
  if (!siguienteEstado(estado, 'RADICAR')) throw new ApiError(409, `Tu plan de aula está ${NOMBRES_ESTADO_PLAN[estado]}.`);

  const _id = existente?._id ?? new Types.ObjectId();
  const numero = (existente?.versiones.length ?? 0) + 1;
  const guardado = await guardarPdf(carpetaPlanAula(String(_id)), `v${numero}`, archivo);
  const version = {
    numero,
    titulo: input.titulo,
    descripcion: input.descripcion,
    archivo: guardado,
    origen: 'CARGADA' as const,
    adoptado_de: null,
    subido_por: docente._id,
    fecha: ahora,
  };

  // La etiqueta de plazo se decide solo en la primera radicación; las correcciones de un plan devuelto no la cambian.
  const radicacion = evaluarRadicacion(ahora, ventana, clase.asignado_desde);

  let plan: PlanAulaDocument | null;
  try {
    plan = existente
      ? await PlanAula.findOneAndUpdate({ _id, estado: 'DEVUELTO' }, { $set: { estado: 'EN_REVISION' }, $push: { versiones: version } }, { new: true })
      : await PlanAula.create({
          _id,
          ...llave,
          estado: 'EN_REVISION',
          radicacion: { fecha: ahora, fecha_limite: radicacion.fecha_limite, fuera_de_plazo: radicacion.fuera_de_plazo },
          versiones: [version],
        });
  } catch (err) {
    await borrarArchivo(guardado);
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'Ya radicaste un plan de aula para esta asignatura, grado y periodo.');
    throw err;
  }
  if (!plan) {
    await borrarArchivo(guardado);
    throw new ApiError(409, 'Tu plan de aula cambió de estado: recarga e inténtalo de nuevo.');
  }

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'PLAN_AULA_RADICADO',
    entidad: 'PlanAula',
    entidad_id: plan._id,
    detalle: `Periodo ${input.periodo_numero}, versión ${numero}${!existente && radicacion.fuera_de_plazo ? ' (fuera de plazo)' : ''}.`,
    ip,
  });
  await avisarPlanEnRevision();
  return obtenerPlanDeAula(String(plan._id), docente);
}

// --- Adoptar el plan de un docente anterior ---

/**
 * El docente que llegó a reemplazar a otro adopta su plan de aula ya aprobado: queda habilitado al instante, sin cola de revisión, con
 * el rastro de dónde salió. El original queda intacto (otro docente nuevo puede adoptarlo también). Solo se adopta el plan de quien
 * ya no dicta esa asignatura en ese grado, nunca el de un colega que sigue activo.
 */
export async function adoptarPlanDeAula(planOrigenId: string, docente: UserDocument, ip?: string | null) {
  const origen = await PlanAula.findById(planOrigenId);
  if (!origen) throw new ApiError(404, 'El plan que quieres adoptar no existe.');
  if (origen.estado !== 'APROBADO') throw new ApiError(409, 'Solo se puede adoptar un plan de aula aprobado.');
  if (String(origen.docente_id) === String(docente._id)) throw new ApiError(409, 'Ese plan ya es tuyo.');

  const anio = await cargarAnio(String(origen.academic_year_id));
  if (anio.estado === 'CERRADO') throw new ApiError(409, `El año lectivo ${anio.year} está cerrado y solo admite consulta.`);

  const clases = await clasesActivasAgrupadas({ academic_year_id: anio._id, docente_id: docente._id });
  const clase = clases.find((c) => c.subject_id === String(origen.subject_id) && c.grade_id === String(origen.grade_id));
  if (!clase) throw new ApiError(403, 'No tienes asignada esta asignatura en este grado: solo quien la dicta adopta su plan de aula.');
  const activas = await clavesConClaseActiva(anio._id, [origen.subject_id]);
  if (activas.has(claveDeClase(origen.docente_id, origen.subject_id, origen.grade_id))) {
    throw new ApiError(409, 'Ese plan es de un docente que sigue dictando esta asignatura: cada docente radica el suyo.');
  }

  const { asignaturas, grados } = await catalogos([origen.subject_id], [origen.grade_id]);
  const asignatura = asignaturas.get(String(origen.subject_id));
  const grado = grados.get(String(origen.grade_id));
  if (!asignatura || !grado) throw new ApiError(404, 'Asignatura o grado no encontrados.');
  const planAreaClase = planAreaDeLaClase(await cargarCoberturas(anio._id, [asignatura.area_id._id]), String(asignatura.area_id._id), grado, clase);
  if (planAreaClase.estado !== 'APROBADO') {
    throw new ApiError(409, mensajeDeBloqueo('PLAN_AREA_PENDIENTE', { area: asignatura.area_id.nombre, detalle: planAreaClase.detalle }));
  }

  const llave = {
    academic_year_id: anio._id,
    periodo_numero: origen.periodo_numero,
    subject_id: origen.subject_id,
    grade_id: origen.grade_id,
    docente_id: docente._id,
  };
  if (await PlanAula.exists(llave)) throw new ApiError(409, 'Ya tienes un plan de aula para esta asignatura, grado y periodo.');

  const ultima = origen.versiones.at(-1);
  if (!ultima) throw new ApiError(409, 'El plan que quieres adoptar no tiene documento.');
  const personasOrigen = await cargarPersonas([origen.docente_id]);
  const anterior = personasOrigen.get(String(origen.docente_id));

  const ahora = new Date();
  const ventana = ventanaDeEntrega(anio.periodos, origen.periodo_numero);
  const _id = new Types.ObjectId();
  const copia = await copiarPdf(ultima.archivo, carpetaPlanAula(String(_id)), 'v1');

  let plan: PlanAulaDocument;
  try {
    plan = await PlanAula.create({
      _id,
      ...llave,
      estado: 'APROBADO',
      radicacion: { fecha: ahora, fecha_limite: ventana?.limite ?? null, fuera_de_plazo: false },
      versiones: [
        {
          numero: 1,
          titulo: ultima.titulo,
          descripcion: ultima.descripcion,
          archivo: copia,
          origen: 'ADOPTADA',
          adoptado_de: { plan_aula_id: origen._id, docente_id: origen.docente_id, version: ultima.numero },
          subido_por: docente._id,
          fecha: ahora,
        },
      ],
      revisiones: [
        {
          accion: 'APROBADO',
          version: 1,
          comentario: `Adoptado del plan aprobado de ${anterior ? `${anterior.nombre} ${anterior.apellido}` : 'un docente anterior'}: no requiere nueva revisión.`,
          revisor_id: null,
          fecha: ahora,
          automatica: true,
        },
      ],
    });
  } catch (err) {
    await borrarArchivo(copia);
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'Ya tienes un plan de aula para esta asignatura, grado y periodo.');
    throw err;
  }

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'PLAN_AULA_ADOPTADO',
    entidad: 'PlanAula',
    entidad_id: plan._id,
    detalle: `Periodo ${origen.periodo_numero}, adoptado del plan ${String(origen._id)} (docente ${String(origen.docente_id)}).`,
    ip,
  });
  return obtenerPlanDeAula(String(plan._id), docente);
}

// --- Revisión ---

/** Coordinación o administración aprueban el plan de aula o lo devuelven con un comentario que el docente debe poder leer. */
export async function revisarPlanDeAula(id: string, input: RevisarPlanInput, revisor: UserDocument, ip?: string | null) {
  const comentario = input.comentario?.trim() ?? '';
  if (input.decision === 'DEVUELTO' && !comentario) throw new ApiError(400, 'Para devolver el plan debes escribir un comentario: es lo que el docente va a corregir.');
  if (comentario.length > MAX_COMENTARIO_REVISION) throw new ApiError(400, `El comentario no puede superar los ${MAX_COMENTARIO_REVISION} caracteres.`);

  const plan = await PlanAula.findById(id);
  if (!plan) throw new ApiError(404, 'Plan de aula no encontrado.');
  await asegurarAnioNoCerrado(String(plan.academic_year_id));

  const nuevoEstado = siguienteEstado(plan.estado, input.decision === 'APROBADO' ? 'APROBAR' : 'DEVOLVER');
  if (!nuevoEstado) throw new ApiError(409, `Solo se revisa un plan en revisión (este está ${NOMBRES_ESTADO_PLAN[plan.estado]}).`);

  const revisado = await PlanAula.findOneAndUpdate(
    { _id: plan._id, estado: 'EN_REVISION' },
    {
      $set: { estado: nuevoEstado },
      $push: { revisiones: { accion: input.decision, version: plan.versiones.length, comentario, revisor_id: revisor._id, fecha: new Date(), automatica: false } },
    },
    { new: true }
  );
  if (!revisado) throw new ApiError(409, 'El plan ya fue revisado o cambió de estado: recarga e inténtalo de nuevo.');

  await registrarEvento({
    usuario_id: revisor._id,
    accion: 'PLAN_AULA_REVISADO',
    entidad: 'PlanAula',
    entidad_id: plan._id,
    detalle: `Periodo ${plan.periodo_numero} → ${nuevoEstado}.`,
    ip,
  });
  await avisarPlanRevisado({ _id: plan._id, docenteId: plan.docente_id, decision: input.decision, subjectId: plan.subject_id });
  return obtenerPlanDeAula(id, revisor);
}

/** Solo el administrador, con motivo. El docente vuelve a poder corregirlo y, mientras tanto, no programa actividades de ese periodo. */
export async function reabrirPlanDeAula(id: string, motivo: string, actor: UserDocument, ip?: string | null) {
  if (actor.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo un administrador puede reabrir un plan de aula aprobado.');
  const texto = motivo.trim();
  if (!texto) throw new ApiError(400, 'Escribe el motivo de la reapertura.');

  const plan = await PlanAula.findById(id);
  if (!plan) throw new ApiError(404, 'Plan de aula no encontrado.');
  await asegurarAnioNoCerrado(String(plan.academic_year_id));
  if (!siguienteEstado(plan.estado, 'REABRIR')) throw new ApiError(409, `Solo se reabre un plan aprobado (este está ${NOMBRES_ESTADO_PLAN[plan.estado]}).`);

  const reabierto = await PlanAula.findOneAndUpdate(
    { _id: plan._id, estado: 'APROBADO' },
    {
      $set: { estado: 'DEVUELTO' },
      $push: { revisiones: { accion: 'REABIERTO', version: plan.versiones.length, comentario: texto, revisor_id: actor._id, fecha: new Date(), automatica: false } },
    },
    { new: true }
  );
  if (!reabierto) throw new ApiError(409, 'El plan cambió de estado: recarga e inténtalo de nuevo.');

  await registrarEvento({ usuario_id: actor._id, accion: 'PLAN_AULA_REABIERTO', entidad: 'PlanAula', entidad_id: plan._id, detalle: `Periodo ${plan.periodo_numero}.`, ip });
  return obtenerPlanDeAula(id, actor);
}

/** Ruta del PDF de una versión (la última si no se indica): coordinación, su dueño y, si está archivado y aprobado, quien hoy dicta esa asignatura en ese grado. */
export async function rutaDelArchivoPlanDeAula(id: string, version: number | undefined, usuario: UserDocument): Promise<{ ruta: string; nombre: string }> {
  const { plan } = await cargarPlanVisible(id, usuario);
  const elegida = version === undefined ? plan.versiones.at(-1) : plan.versiones.find((v) => v.numero === version);
  if (!elegida) throw new ApiError(404, 'Esa versión del plan de aula no existe.');
  return { ruta: rutaAbsoluta(elegida.archivo), nombre: elegida.archivo.nombre };
}
