import { Types } from 'mongoose';
import { NOMBRES_ESTADO_PLAN } from '../constants/planeacion';
import Group from '../models/group.model';
import PlanAula, { PlanAulaDocument } from '../models/planAula.model';
import { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import ApiError from '../utils/ApiError';
import { alcanceCubre, rebanadasSinCubrir, textoDeAlcance, textoDeRebanadas } from '../utils/liderArea';
import { NOMBRES_MOTIVO_AREA_PENDIENTE, motivoAreaPendiente } from '../utils/planeacion';
import { cargarCoberturas, demandaDelAnio, nombresDeSedes } from './planeacionCobertura.service';

/**
 * Las dos compuertas de M07, en un módulo aparte que solo lee modelos: las llaman el año lectivo (M05) y las actividades (M11),
 * que a su vez las usa M07, y así no hay ciclos de importación.
 */

/**
 * Compuerta de la activación del año (M05): ningún área obligatoria puede quedar sin plan de área aprobado en ninguna parte de la
 * institución donde se dicta. Cada área tiene uno o varios líderes (por nivel, jornada o sede): se revisa que todo lo que el área
 * necesita tenga su líder y que el plan de cada líder necesario esté aprobado. El 409 lleva qué falta y por qué (sin líder, sin
 * cargar, en revisión o devuelto), con el alcance de cada caso, para que la pantalla diga qué resolver.
 */
export async function exigirPlanesDeAreaAprobados(anio: { _id: Types.ObjectId; year: number }): Promise<void> {
  const { areas, rebanadas } = await demandaDelAnio(anio._id);
  if (areas.length === 0) return;

  const [coberturas, sedes] = await Promise.all([cargarCoberturas(anio._id, areas.map((a) => a._id)), nombresDeSedes()]);

  const pendientes = areas.flatMap((area) => {
    const areaId = String(area._id);
    const demandadas = rebanadas.get(areaId) ?? [];
    const propias = coberturas.filter((c) => c.area_id === areaId);
    const entradas: Array<{ clave: string; area_id: string; nombre: string; alcance: string; motivo: string; detalle: string }> = [];

    // Un líder dado de baja solo cubre si dejó su plan aprobado: si no, es como no tenerlo.
    const vigentes = propias.filter((c) => c.docente_activo || c.estado === 'APROBADO');
    const sinCubrir = rebanadasSinCubrir(demandadas, vigentes.map((c) => c.alcance));
    if (sinCubrir.length > 0) {
      entradas.push({
        clave: `${areaId}:sin-lider`,
        area_id: areaId,
        nombre: area.nombre,
        alcance: textoDeRebanadas(sinCubrir, sedes.nombres, sedes.variasSedes).join('; '),
        motivo: 'SIN_LIDER',
        detalle: NOMBRES_MOTIVO_AREA_PENDIENTE.SIN_LIDER,
      });
    }
    // Los que no cuentan como líder ya quedaron en «sin líder» arriba: no se repiten.
    for (const c of vigentes) {
      if (!demandadas.some((r) => alcanceCubre(c.alcance, r))) continue;
      const motivo = motivoAreaPendiente(c.docente_activo, c.estado);
      if (motivo) {
        entradas.push({
          clave: `${areaId}:${c._id}`,
          area_id: areaId,
          nombre: area.nombre,
          alcance: textoDeAlcance(c.alcance, sedes.nombres),
          motivo,
          detalle: NOMBRES_MOTIVO_AREA_PENDIENTE[motivo],
        });
      }
    }
    return entradas;
  });
  if (pendientes.length === 0) return;

  const cuantasAreas = new Set(pendientes.map((p) => p.area_id)).size;
  throw new ApiError(
    409,
    `No se puede activar el año lectivo ${anio.year}: ${cuantasAreas} área(s) obligatoria(s) no tienen su plan de área aprobado.`,
    { areas_pendientes: pendientes }
  );
}

/**
 * Compuerta de las actividades (M11): un docente no programa ni publica actividades en un periodo si su plan de aula de esa
 * asignatura y grado no está aprobado. El plan es del docente (no de la asignación) y por grado: el grupo solo aporta el grado.
 */
export async function exigirPlanAulaAprobado(
  asignacion: Pick<TeacherAssignmentDocument, 'academic_year_id' | 'group_id' | 'subject_id' | 'docente_id'>,
  periodo: number
): Promise<PlanAulaDocument> {
  const grupo = await Group.findById(asignacion.group_id).select('grade_id').lean();
  if (!grupo) throw new ApiError(404, 'Grupo de la asignación académica no encontrado.');

  const plan = await PlanAula.findOne({
    academic_year_id: asignacion.academic_year_id,
    periodo_numero: periodo,
    subject_id: asignacion.subject_id,
    grade_id: grupo.grade_id,
    docente_id: asignacion.docente_id,
  });
  if (!plan) {
    throw new ApiError(
      409,
      `Aún no has radicado tu plan de aula del periodo ${periodo}. Cárgalo en «Planeación» y espera la aprobación de coordinación para programar actividades.`
    );
  }
  if (plan.estado !== 'APROBADO') {
    throw new ApiError(
      409,
      `Tu plan de aula del periodo ${periodo} está ${NOMBRES_ESTADO_PLAN[plan.estado]}: coordinación debe aprobarlo antes de programar actividades.`
    );
  }
  return plan;
}
