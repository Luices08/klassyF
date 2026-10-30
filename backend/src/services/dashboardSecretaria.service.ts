import { TTL_DASHBOARD_MS } from '../constants/dashboard';
import { ESTADOS_MATRICULA, ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import AcademicYear from '../models/academicYear.model';
import AdmissionRequest from '../models/admissionRequest.model';
import ConfirmacionContinuidad from '../models/confirmacionContinuidad.model';
import Enrollment from '../models/enrollment.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import PazYSalvoSalida from '../models/pazYSalvoSalida.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { memorizar } from '../utils/cacheCorta';
import { porcentaje } from '../utils/dashboard';
import { contarPorClave, diasDesde, filtroDeSedes, sedesPermitidas } from '../utils/dashboardBienestar';
import { documentosPorRevisar, ocupacionPorGrado, resumirCondicionales, resumirRenovacion } from '../utils/dashboardSecretaria';
import { estadoGlobalDePazYSalvo } from '../utils/salidas';
import { alcanceDeSedes } from '../utils/permisosConvivencia';
import { ROLES } from '../constants/roles';

/** Panel de secretaría (M30): lo que tiene por tramitar en sus sedes. Solo conteos de M01 y M04; nada de salud, convivencia ni notas, que secretaría no consulta. */

export interface FiltrosSecretaria {
  academic_year_id: string;
  sede_id?: string;
}

/** Cuántos grados salen en la gráfica de ocupación: los más llenos; con el ancho de dos tercios caben ocho legibles. */
const MAX_GRADOS_EN_OCUPACION = 8;

/** Lo que se ve depende de quién mira (sus sedes), así que la caché es por usuario. */
const clave = (f: FiltrosSecretaria, usuario: UserDocument) => `secretaria:${f.academic_year_id}:${f.sede_id ?? '*'}:${String(usuario._id)}`;

export async function obtenerPanelSecretaria(filtros: FiltrosSecretaria, usuario: UserDocument) {
  if (usuario.rol !== ROLES.SECRETARIA) throw new ApiError(403, 'Solo secretaría consulta este panel.');
  return memorizar(clave(filtros, usuario), TTL_DASHBOARD_MS, async () => {
    const anio = await AcademicYear.findById(filtros.academic_year_id).select('year').lean();
    if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');

    const sedes = sedesPermitidas(alcanceDeSedes({ rol: usuario.rol, sedes_ids: usuario.sedes_ids.map(String) }), filtros.sede_id);
    const ahora = new Date();

    const docs = await Group.find({ academic_year_id: anio._id, estado: { $ne: 'CLOSED' }, ...filtroDeSedes(sedes) })
      .select('grade_id nomenclatura max_capacity cupos_ocupados')
      .lean();
    const grupoIds = docs.map((g) => g._id);
    const grados = await Grade.find({ _id: { $in: docs.map((g) => g.grade_id) } }).select('nombre numero').lean();
    const gradoPor = new Map(grados.map((g) => [String(g._id), g]));
    const delAnio = { academic_year_id: anio._id, group_id: { $in: grupoIds } };

    // Una solicitud sin sede deseada («sin preferencia») es de todas las sedes.
    const solicitudesDeSedes = sedes === 'TODAS' ? {} : { $or: [{ sede_deseada_id: { $in: sedes } }, { sede_deseada_id: null }] };

    const [matriculas, solicitudes, retiradas, decisiones] = await Promise.all([
      Enrollment.find({ ...delAnio, estado: { $in: ESTADOS_MATRICULA } })
        .select('estado fecha_limite_compromiso checklist.estado')
        .lean(),
      AdmissionRequest.find({ estado: { $in: ['PENDIENTE', 'ADMITIDO'] }, $and: [{ $or: [{ academic_year_id: anio._id }, { academic_year_id: null }] }, solicitudesDeSedes] })
        .select('estado createdAt')
        .lean(),
      Enrollment.find({ ...delAnio, estado: 'RETIRADO' }).select('salida.cupo_liberado').lean(),
      ConfirmacionContinuidad.find({ academic_year_id: anio._id, ...filtroDeSedes(sedes) }).select('decision').lean(),
    ]);
    const pazYSalvo = retiradas.length > 0 ? await PazYSalvoSalida.find({ enrollment_id: { $in: retiradas.map((r) => r._id) } }).select('dependencias.estado').lean() : [];
    const estadosPazYSalvo = pazYSalvo.map((p) => estadoGlobalDePazYSalvo(p.dependencias));

    const activas = matriculas.filter((m) => (ESTADOS_MATRICULA_ACTIVOS as readonly string[]).includes(m.estado));
    const vivas = matriculas.filter((m) => m.estado !== 'RETIRADO' && m.estado !== 'ANULADO');
    const condicionales = matriculas.filter((m) => m.estado === 'MATRICULADO_CONDICIONAL');
    const capacidad = docs.reduce((s, g) => s + g.max_capacity, 0);
    const pendientesDeSolicitud = solicitudes.filter((s) => s.estado === 'PENDIENTE');
    const masAntigua = pendientesDeSolicitud.reduce<Date | null>((min, s) => (min === null || s.createdAt < min ? s.createdAt : min), null);

    return {
      contexto: { academic_year_id: String(anio._id), anio: anio.year, grupos: docs.length },
      matricula: {
        matriculados: activas.length,
        capacidad,
        disponibles: Math.max(0, capacidad - activas.length),
        ocupacion_pct: porcentaje(activas.length, capacidad),
        preinscritos: matriculas.filter((m) => m.estado === 'PREINSCRITO').length,
        por_estado: contarPorClave(ESTADOS_MATRICULA, matriculas.map((m) => m.estado)),
      },
      admisiones: {
        pendientes: pendientesDeSolicitud.length,
        admitidas: solicitudes.length - pendientesDeSolicitud.length,
        mas_antigua_dias: diasDesde(masAntigua, ahora),
      },
      documentos: {
        por_revisar: documentosPorRevisar(vivas.map((m) => m.checklist ?? [])),
        condicionales: resumirCondicionales(condicionales, ahora),
      },
      salidas: {
        total: retiradas.length,
        paz_y_salvo_pendiente: estadosPazYSalvo.filter((e) => e === 'PENDIENTE').length,
        paz_y_salvo_bloqueado: estadosPazYSalvo.filter((e) => e === 'BLOQUEADO').length,
        cupo_retenido: retiradas.filter((r) => r.salida && !r.salida.cupo_liberado).length,
      },
      renovacion: resumirRenovacion(activas.length, decisiones.map((d) => d.decision)),
      ocupacion_por_grado: ocupacionPorGrado(
        docs.map((g) => {
          const grado = gradoPor.get(String(g.grade_id));
          return { grado_id: String(g.grade_id), grado: grado?.nombre ?? '', grado_numero: grado?.numero ?? 0, max_capacity: g.max_capacity, cupos_ocupados: g.cupos_ocupados };
        }),
        MAX_GRADOS_EN_OCUPACION
      ),
    };
  });
}
