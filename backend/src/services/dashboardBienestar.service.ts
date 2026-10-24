import { Types } from 'mongoose';
import { TTL_DASHBOARD_MS } from '../constants/dashboard';
import { ESTADOS_CASO, ESTADOS_REMISION_ORIENTACION, TIPOS_SITUACION } from '../constants/convivencia';
import { ESTADOS_EXPEDIENTE } from '../constants/inclusion';
import { ROLES } from '../constants/roles';
import AjusteAsignatura from '../models/ajusteAsignatura.model';
import CasoConvivencia from '../models/casoConvivencia.model';
import { SesionComite } from '../models/comiteConvivencia.model';
import { periodicidadDeAnio } from './comite.service';
import ExpedienteInclusion from '../models/expedienteInclusion.model';
import Observacion from '../models/observacion.model';
import RemisionOrientacion from '../models/remisionOrientacion.model';
import SolicitudApoyo from '../models/solicitudApoyo.model';
import SolicitudCaso from '../models/solicitudCaso.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { memorizar } from '../utils/cacheCorta';
import { alertasDeCaso, ESTADOS_CASO_FINALES } from '../utils/casoConvivencia';
import { contarPorClave, diasDesde, filtroDeSedes, resumirSeguimientoDeAjustes, sedesPermitidas } from '../utils/dashboardBienestar';
import { alcanceDeSedes } from '../utils/permisosConvivencia';
import { hoyColombia } from './attendance.service';
import { obtenerConfiguracion as configuracionDeConvivencia } from './convivenciaCatalogo.service';
import { obtenerConfiguracion as configuracionDeInclusion } from './inclusionContexto.service';

/** Paneles de bienestar (M30): lo que convivencia y orientación tienen por atender. Solo conteos y códigos; el detalle vive en sus pantallas. */

export interface FiltrosBienestar {
  academic_year_id: string;
  sede_id?: string;
}

const ROLES_CONVIVENCIA: string[] = [ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA];
const ROLES_ORIENTACION: string[] = [ROLES.ADMIN, ROLES.ORIENTADOR];
/** Cuántos días hacia atrás cuentan las faltas del panel de convivencia. */
const DIAS_DE_FALTAS = 30;
const MAX_CASOS_CON_ALERTA = 8;

const sedesDe = (usuario: UserDocument, sedeId?: string) => sedesPermitidas(alcanceDeSedes({ rol: usuario.rol, sedes_ids: usuario.sedes_ids.map(String) }), sedeId);

/** Como en cada módulo, lo que se ve depende de quién mira (sus sedes, los casos de los que se declaró impedido): la caché es por usuario. */
const clave = (bloque: string, f: FiltrosBienestar, usuario: UserDocument) => `bienestar:${bloque}:${f.academic_year_id}:${f.sede_id ?? '*'}:${String(usuario._id)}`;

// --- Convivencia ---

/**
 * El panel del coordinador de convivencia: solicitudes por atender, casos abiertos por estado y tipo, alertas calculadas (M15), la agenda del comité,
 * las faltas de los últimos 30 días por gravedad y lo que ya se remitió a orientación. Solo convivencia y rectoría; cada una ve sus sedes.
 */
export async function obtenerPanelConvivencia(filtros: FiltrosBienestar, usuario: UserDocument) {
  if (!ROLES_CONVIVENCIA.includes(usuario.rol)) throw new ApiError(403, 'Solo convivencia consulta este panel.');
  return memorizar(clave('convivencia', filtros, usuario), TTL_DASHBOARD_MS, async () => {
    const sedes = sedesDe(usuario, filtros.sede_id);
    const porSede = filtroDeSedes(sedes);
    const ahora = new Date();
    const hoy = hoyColombia();
    const desde = new Date(hoy.getTime() - DIAS_DE_FALTAS * 86_400_000);
    // Quien se declaró impedido en un caso deja de verlo (RN-15-11), también en los conteos.
    const delUsuario = { 'impedidos.usuario_id': { $ne: usuario._id } };

    const [solicitudes, casos, configuracion, borradores, proximaSesion, faltas, remisiones, periodicidad] = await Promise.all([
      SolicitudCaso.find({ estado: 'PENDIENTE', ...porSede }).select('createdAt').lean(),
      CasoConvivencia.find({ estado: { $nin: ESTADOS_CASO_FINALES }, ...delUsuario, ...porSede }).select('codigo estado tipo_situacion remisiones justificacion_sin_remision seguimientos createdAt').lean(),
      configuracionDeConvivencia(),
      SesionComite.countDocuments({ academic_year_id: filtros.academic_year_id, estado: 'BORRADOR' }),
      SesionComite.findOne({ academic_year_id: filtros.academic_year_id, estado: 'BORRADOR', fecha: { $gte: hoy } }).sort({ fecha: 1 }).select('fecha hora lugar tipo').lean(),
      Observacion.find({ clase: 'FALTA', estado: 'ACTIVA', fecha_hecho: { $gte: desde }, ...porSede }).select('falta.gravedad').lean(),
      RemisionOrientacion.find({ estado: { $in: ['PENDIENTE', 'EN_ATENCION'] }, ...porSede }).select('estado').lean(),
      periodicidadDeAnio(filtros.academic_year_id),
    ]);

    const conAlertas = casos
      .map((c) => ({ c, alertas: alertasDeCaso({ ...c, seguimientos: c.seguimientos ?? [] }, configuracion, ahora, hoy) }))
      .filter((x) => x.alertas.length > 0);
    const masAntigua = solicitudes.reduce<Date | null>((m, s) => (m === null || s.createdAt < m ? s.createdAt : m), null);

    return {
      solicitudes: { pendientes: solicitudes.length, mas_antigua_dias: diasDesde(masAntigua, ahora) },
      casos: {
        activos: casos.length,
        por_estado: contarPorClave(ESTADOS_CASO.filter((e) => !ESTADOS_CASO_FINALES.includes(e)), casos.map((c) => c.estado)),
        por_tipo: contarPorClave(TIPOS_SITUACION, casos.map((c) => c.tipo_situacion)),
      },
      alertas: {
        total: conAlertas.length,
        remision_tipo_iii: conAlertas.filter((x) => x.alertas.some((a) => a.codigo === 'REMISION_TIPO_III_PENDIENTE')).length,
        seguimiento_vencido: conAlertas.filter((x) => x.alertas.some((a) => a.codigo === 'SEGUIMIENTO_VENCIDO')).length,
        // Solo el código del caso y el tipo: quién está involucrado lo ve quien abre el caso, no el tablero.
        casos: conAlertas.slice(0, MAX_CASOS_CON_ALERTA).map((x) => ({ _id: String(x.c._id), codigo: x.c.codigo, tipo_situacion: x.c.tipo_situacion, alertas: x.alertas.map((a) => a.codigo) })),
      },
      comite: {
        borradores,
        proxima: proximaSesion ? { fecha: proximaSesion.fecha, hora: proximaSesion.hora, lugar: proximaSesion.lugar, tipo: proximaSesion.tipo } : null,
        // Decreto 1965, art. 23: una sesión ordinaria como mínimo cada dos meses.
        periodicidad_vencida: periodicidad.vencida,
        ultima_ordinaria: periodicidad.ultima_ordinaria,
      },
      faltas: { dias: DIAS_DE_FALTAS, total: faltas.length, por_gravedad: contarPorClave(TIPOS_SITUACION, faltas.flatMap((f) => (f.falta?.gravedad ? [f.falta.gravedad] : []))) },
      remisiones_orientacion: {
        pendientes: remisiones.filter((r) => r.estado === 'PENDIENTE').length,
        en_atencion: remisiones.filter((r) => r.estado === 'EN_ATENCION').length,
      },
    };
  });
}

// --- Orientación ---

/**
 * El panel de orientación: remisiones que le enviaron, solicitudes de apoyo por valorar y cómo van los expedientes de inclusión (por estado, plazos vencidos,
 * autorizaciones de datos y seguimiento mínimo de los ajustes). Nunca categoría de discapacidad, diagnóstico ni contenido de una atención.
 */
export async function obtenerPanelOrientacion(filtros: FiltrosBienestar, usuario: UserDocument) {
  if (!ROLES_ORIENTACION.includes(usuario.rol)) throw new ApiError(403, 'Solo orientación consulta este panel.');
  return memorizar(clave('orientacion', filtros, usuario), TTL_DASHBOARD_MS, async () => {
    const sedes = sedesDe(usuario, filtros.sede_id);
    const porSede = filtroDeSedes(sedes);
    const ahora = new Date();
    const anio = new Types.ObjectId(filtros.academic_year_id);

    const [remisiones, solicitudes, expedientes, configuracion] = await Promise.all([
      RemisionOrientacion.find({ ...porSede }).select('estado createdAt').lean(),
      SolicitudApoyo.find({ estado: { $in: ['PENDIENTE', 'EN_VALORACION'] }, ...porSede }).select('estado').lean(),
      ExpedienteInclusion.find({ academic_year_id: anio, ...porSede }).select('tipo estado consentimiento fecha_limite_elaboracion').lean(),
      configuracionDeInclusion(),
    ]);

    const pendientes = remisiones.filter((r) => r.estado === 'PENDIENTE');
    const masAntigua = pendientes.reduce<Date | null>((m, r) => (m === null || r.createdAt < m ? r.createdAt : m), null);
    const vigentes = expedientes.filter((e) => e.estado !== 'CERRADO');
    const activosPiar = expedientes.filter((e) => e.tipo === 'PIAR' && e.estado === 'ACTIVO');
    const ajustes = activosPiar.length
      ? await AjusteAsignatura.find({ expediente_id: { $in: activosPiar.map((e) => e._id) } }).select('seguimientos.periodo_numero').lean()
      : [];

    return {
      remisiones: {
        ...contarPorClave(ESTADOS_REMISION_ORIENTACION, remisiones.map((r) => r.estado)),
        mas_antigua_dias: diasDesde(masAntigua, ahora),
      },
      solicitudes_apoyo: { pendientes: solicitudes.filter((s) => s.estado === 'PENDIENTE').length, en_valoracion: solicitudes.filter((s) => s.estado === 'EN_VALORACION').length },
      expedientes: {
        total: expedientes.length,
        por_estado: contarPorClave(ESTADOS_EXPEDIENTE, expedientes.map((e) => e.estado)),
        piar: expedientes.filter((e) => e.tipo === 'PIAR').length,
        plan_apoyo: expedientes.filter((e) => e.tipo !== 'PIAR').length,
        plazo_vencido: expedientes.filter((e) => ['BORRADOR', 'EN_CONSTRUCCION'].includes(e.estado) && e.fecha_limite_elaboracion && e.fecha_limite_elaboracion.getTime() < ahora.getTime()).length,
        sin_autorizacion: vigentes.filter((e) => !e.consentimiento?.otorgado || e.consentimiento?.revocado).length,
      },
      seguimiento: { ...resumirSeguimientoDeAjustes(ajustes.map((a) => ({ seguimientos: a.seguimientos ?? [] })), configuracion.seguimientos_minimos_anio), minimo: configuracion.seguimientos_minimos_anio },
    };
  });
}
