import { ClientSession, Types } from 'mongoose';
import {
  ESTADOS_CASO,
  EstadoCaso,
  MedioCitacion,
  ParteDescargo,
  ResultadoCierreCaso,
  RolInvolucrado,
  TipoNotificacionCaso,
  TipoSituacion,
} from '../constants/convivencia';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import CasoConvivencia, { CasoConvivenciaDocument } from '../models/casoConvivencia.model';
import { EntidadExterna, MedidaConvivencia, ProtocoloConvivencia } from '../models/catalogosCaso.model';
import Counter from '../models/counter.model';
import FaltaConvivencia from '../models/faltaConvivencia.model';
import RemisionOrientacion from '../models/remisionOrientacion.model';
import SolicitudCaso from '../models/solicitudCaso.model';
import { User, UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import {
  alertasDeCaso,
  ESTADOS_CASO_CERRABLES,
  ESTADOS_CASO_FINALES,
  esEscalamiento,
  pasosFaltantes,
  pendientesParaCerrar,
  puedeTransicionar,
} from '../utils/casoConvivencia';
import { alcanceDeSedes, enAlcanceDeSede, UsuarioConvivencia } from '../utils/permisosConvivencia';
import runTransaction from '../utils/runTransaction';
import { fechaDeClase, hoyColombia } from './attendance.service';
import { registrarEvento } from './audit.service';
import { obtenerConfiguracion } from './convivenciaCatalogo.service';
import { exigirPermisoSobreEstudiante } from './observacion.service';
import { auditarRemisionesCreadas, remitirAutomaticamente, remitirManualmente, resumenDeRemisionesDelCaso } from './remisionOrientacion.service';

const ROLES_CONVIVENCIA: string[] = [ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA];
const NO_ENCONTRADO = 'Caso no encontrado.';

const comoUsuarioConvivencia = (u: UserDocument): UsuarioConvivencia => ({
  id: String(u._id),
  rol: u.rol,
  sedes_ids: u.sedes_ids.map(String),
});

/**
 * Solo convivencia (ADMIN y el coordinador de convivencia de esa sede) ve y gestiona un caso. Quien fue apartado por
 * conflicto de interés (RN-15-11) tampoco. "No existe" y "no autorizado" responden igual.
 */
export async function cargarCaso(id: string, usuario: UserDocument): Promise<CasoConvivenciaDocument> {
  const caso = ROLES_CONVIVENCIA.includes(usuario.rol) && Types.ObjectId.isValid(id) ? await CasoConvivencia.findById(id) : null;
  if (!caso) throw new ApiError(404, NO_ENCONTRADO);
  if (usuario.rol !== ROLES.ADMIN) {
    const sinAcceso =
      !enAlcanceDeSede(comoUsuarioConvivencia(usuario), String(caso.sede_id)) ||
      caso.impedidos.some((i) => String(i.usuario_id) === String(usuario._id));
    if (sinAcceso) throw new ApiError(404, NO_ENCONTRADO);
  }
  return caso;
}

function exigirEditable(caso: CasoConvivenciaDocument) {
  if (ESTADOS_CASO_FINALES.includes(caso.estado)) {
    throw new ApiError(409, `El caso está ${caso.estado === 'CERRADO' ? 'cerrado' : 'anulado'}: ya no admite cambios.`);
  }
}

const exigirFechaNoFutura = (fecha: Date, que: string) => {
  if (fecha > hoyColombia()) throw new ApiError(400, `${que} no puede ser futura.`);
};

async function nombresDeUsuarios(ids: Iterable<string>): Promise<Map<string, string>> {
  const usuarios = await User.find({ _id: { $in: [...new Set(ids)] } }).select('nombre apellido');
  return new Map(usuarios.map((u) => [String(u._id), `${u.nombre} ${u.apellido}`]));
}

/** Recorre el documento y agrega `por_nombre` junto a cada `por`, para mostrar quién hizo cada registro. */
function anotarAutores(valor: unknown, nombres: Map<string, string>): unknown {
  if (Array.isArray(valor)) return valor.map((v) => anotarAutores(v, nombres));
  if (valor && typeof valor === 'object' && !(valor instanceof Date) && !(valor instanceof Types.ObjectId)) {
    const salida: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) salida[clave] = anotarAutores(v, nombres);
    if (salida.por) salida.por_nombre = nombres.get(String(salida.por)) ?? null;
    return salida;
  }
  return valor;
}

function recolectarAutores(valor: unknown, ids: Set<string>) {
  if (Array.isArray(valor)) valor.forEach((v) => recolectarAutores(v, ids));
  else if (valor && typeof valor === 'object' && !(valor instanceof Date) && !(valor instanceof Types.ObjectId)) {
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (clave === 'por' && v) ids.add(String(v));
      else recolectarAutores(v, ids);
    }
  }
}

async function vistaCaso(caso: CasoConvivenciaDocument) {
  const plano = caso.toJSON() as unknown as Record<string, unknown> & { involucrados: { student_id: unknown }[] };
  const autores = new Set<string>();
  recolectarAutores(plano, autores);
  const estudiantes = plano.involucrados.map((i) => String(i.student_id));
  const [nombres, configuracion, remisionesOrientacion] = await Promise.all([
    nombresDeUsuarios([...autores, ...estudiantes]),
    obtenerConfiguracion(),
    resumenDeRemisionesDelCaso(caso._id),
  ]);

  const anotado = anotarAutores(plano, nombres) as Record<string, unknown> & { involucrados: Record<string, unknown>[] };
  anotado.involucrados = anotado.involucrados.map((i) => ({ ...i, estudiante: nombres.get(String(i.student_id)) ?? '' }));
  return { ...anotado, remisiones_orientacion: remisionesOrientacion, alertas: alertasDeCaso(caso, configuracion, new Date(), hoyColombia()) };
}

// --- Apertura ---

export interface AbrirCasoInput {
  tipo_situacion: TipoSituacion;
  fecha_hecho: string;
  lugar?: string;
  hechos: string;
  como_se_conocio?: string;
  involucrados?: { student_id: string; rol: RolInvolucrado }[];
  /** Si viene, el caso convierte esa solicitud pendiente (la que envió un docente al registrar una falta). */
  solicitud_id?: string;
}

export async function abrirCaso(input: AbrirCasoInput, usuario: UserDocument, ip?: string | null) {
  if (!ROLES_CONVIVENCIA.includes(usuario.rol)) throw new ApiError(403, 'Solo convivencia abre casos.');
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' });
  if (!anio) throw new ApiError(409, 'No hay un año lectivo en curso: no se pueden abrir casos.');
  const fecha = fechaDeClase(input.fecha_hecho);
  exigirFechaNoFutura(fecha, 'La fecha del hecho');

  const solicitud = input.solicitud_id && Types.ObjectId.isValid(input.solicitud_id) ? await SolicitudCaso.findOne({ _id: input.solicitud_id, estado: 'PENDIENTE' }) : null;
  const solicitudNoDisponible = () => new ApiError(404, 'La solicitud no existe o ya fue atendida.');
  if (input.solicitud_id && !solicitud) throw solicitudNoDisponible();
  if (solicitud && usuario.rol !== ROLES.ADMIN && !enAlcanceDeSede(comoUsuarioConvivencia(usuario), String(solicitud.sede_id))) throw solicitudNoDisponible();

  // Sin involucrados nuevos, el caso toma los de la solicitud: convivencia puede agregar los que el docente no pudo nombrar.
  const pedidos = input.involucrados?.length
    ? input.involucrados
    : (solicitud?.involucrados.map((i) => ({ student_id: String(i.student_id), rol: i.rol })) ?? []);
  if (pedidos.length === 0) throw new ApiError(400, 'Indica al menos un estudiante involucrado.');

  const vistos = new Set<string>();
  const involucrados: { student_id: Types.ObjectId; rol: RolInvolucrado; group_id: Types.ObjectId; enrollment_id: Types.ObjectId; sede_id: Types.ObjectId }[] = [];
  for (const pedido of pedidos) {
    const clave = `${pedido.student_id}:${pedido.rol}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const contexto = await exigirPermisoSobreEstudiante(usuario, pedido.student_id, 'GESTIONAR_CASO');
    involucrados.push({ student_id: contexto.student_id, rol: pedido.rol, group_id: contexto.grupo._id, enrollment_id: contexto.enrollment_id, sede_id: contexto.grupo.sede_id });
  }
  const sedeDelCaso = (involucrados.find((i) => i.rol === 'PRESUNTO_RESPONSABLE') ?? involucrados[0])!.sede_id;

  const protocolo = await ProtocoloConvivencia.findOne({ tipo_situacion: input.tipo_situacion });
  const pasos = (protocolo?.pasos ?? []).map((p) => ({ nombre: p.nombre, obligatorio: p.obligatorio, remite_a_orientacion: p.remite_a_orientacion, orden: p.orden }));

  const caso = await runTransaction(async (session) => {
    // Consecutivo anual sin huecos: el contador sube dentro de la misma transacción del caso (si falla, se revierte).
    const contador = await Counter.findByIdAndUpdate(`CASO-${anio.year}`, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
    const consecutivo = contador?.seq ?? 0;
    const [creado] = await CasoConvivencia.create(
      [
        {
          codigo: `CC-${anio.year}-${String(consecutivo).padStart(4, '0')}`,
          consecutivo,
          academic_year_id: anio._id,
          anio: anio.year,
          sede_id: sedeDelCaso,
          tipo_situacion: input.tipo_situacion,
          origen: solicitud ? 'SOLICITUD' : 'DIRECTO',
          solicitud_id: solicitud?._id ?? null,
          observacion_ids: solicitud?.involucrados.flatMap((i) => (i.observacion_id ? [i.observacion_id] : [])) ?? [],
          contencion_reportada: solicitud?.acciones_contencion ?? '',
          fecha_hecho: fecha,
          lugar: input.lugar ?? '',
          hechos: input.hechos,
          como_se_conocio: input.como_se_conocio ?? '',
          involucrados: involucrados.map(({ sede_id: _sede, ...resto }) => resto),
          pasos,
          creado_por: usuario._id,
        },
      ],
      { session }
    );
    if (!creado) throw new ApiError(500, 'No se pudo abrir el caso.');

    if (solicitud) {
      solicitud.estado = 'CONVERTIDA';
      solicitud.caso_id = creado._id;
      solicitud.resolucion = { por: usuario._id, fecha: new Date(), motivo: `Se abrió el caso ${creado.codigo}.` };
      await solicitud.save({ session });
    }
    return creado;
  });

  await registrarEvento({ usuario_id: usuario._id, accion: 'CASO_CONVIVENCIA_ABIERTO', entidad: 'CasoConvivencia', entidad_id: caso._id, detalle: `${caso.codigo} tipo ${caso.tipo_situacion}`, ip });
  return vistaCaso(caso);
}

// --- Consulta ---

export interface FiltrosCasos {
  estado?: EstadoCaso;
  tipo_situacion?: TipoSituacion;
  sede_id?: string;
}

export async function listarCasos(usuario: UserDocument, filtros: FiltrosCasos, { pagina, limite }: { pagina: number; limite: number }) {
  if (!ROLES_CONVIVENCIA.includes(usuario.rol)) throw new ApiError(403, 'Solo convivencia consulta los casos.');
  const alcance = alcanceDeSedes(comoUsuarioConvivencia(usuario));
  const filtro: Record<string, unknown> = { 'impedidos.usuario_id': { $ne: usuario._id } };
  if (filtros.estado) filtro.estado = filtros.estado;
  if (filtros.tipo_situacion) filtro.tipo_situacion = filtros.tipo_situacion;
  if (alcance !== 'TODAS') filtro.sede_id = filtros.sede_id && alcance.includes(filtros.sede_id) ? filtros.sede_id : { $in: alcance };
  else if (filtros.sede_id) filtro.sede_id = filtros.sede_id;

  const [total, casos, configuracion] = await Promise.all([
    CasoConvivencia.countDocuments(filtro),
    CasoConvivencia.find(filtro)
      .select('codigo estado tipo_situacion fecha_hecho lugar sede_id involucrados remisiones justificacion_sin_remision seguimientos createdAt')
      .sort({ createdAt: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite),
    obtenerConfiguracion(),
  ]);
  const nombres = await nombresDeUsuarios(casos.flatMap((c) => c.involucrados.map((i) => String(i.student_id))));
  const hoy = hoyColombia();
  const ahora = new Date();

  return {
    total,
    pagina,
    limite,
    data: casos.map((c) => ({
      _id: String(c._id),
      codigo: c.codigo,
      estado: c.estado,
      tipo_situacion: c.tipo_situacion,
      fecha_hecho: c.fecha_hecho,
      lugar: c.lugar,
      sede_id: String(c.sede_id),
      involucrados: c.involucrados.map((i) => ({ rol: i.rol, estudiante: nombres.get(String(i.student_id)) ?? '' })),
      alertas: alertasDeCaso(c, configuracion, ahora, hoy),
    })),
  };
}

/** El detalle se audita siempre (sin muestreo): quién consultó un caso de un menor. */
export async function obtenerCaso(id: string, usuario: UserDocument, ip?: string | null) {
  const caso = await cargarCaso(id, usuario);
  await registrarEvento({ usuario_id: usuario._id, accion: 'CONVIVENCIA_CASO_CONSULTADO', entidad: 'CasoConvivencia', entidad_id: caso._id, ip });
  return vistaCaso(caso);
}

// --- Flujo ---

/** Si el cambio arrastra otras escrituras (p. ej. remisiones a orientación), se guardan todas en la misma transacción: o todo o nada. */
async function guardarYAuditar(
  caso: CasoConvivenciaDocument,
  usuario: UserDocument,
  accion: Parameters<typeof registrarEvento>[0]['accion'],
  detalle: string,
  ip?: string | null,
  conjuntamente?: (session: ClientSession) => Promise<void>
) {
  if (conjuntamente) {
    await runTransaction(async (session) => {
      await caso.save({ session });
      await conjuntamente(session);
    });
  } else {
    await caso.save();
  }
  await registrarEvento({ usuario_id: usuario._id, accion, entidad: 'CasoConvivencia', entidad_id: caso._id, detalle, ip });
  return vistaCaso(caso);
}

export async function cambiarEstadoCaso(id: string, estado: EstadoCaso, usuario: UserDocument, ip?: string | null) {
  const caso = await cargarCaso(id, usuario);
  exigirEditable(caso);
  if (!ESTADOS_CASO.includes(estado) || !puedeTransicionar(caso.estado, estado)) {
    throw new ApiError(409, `Un caso ${caso.estado} no puede pasar a ${estado}.`);
  }
  if (estado === 'REMITIDO' && caso.remisiones.length === 0) {
    throw new ApiError(409, 'Registra primero la remisión a la entidad correspondiente.');
  }
  const anterior = caso.estado;
  caso.estado = estado;
  return guardarYAuditar(caso, usuario, 'CASO_CONVIVENCIA_ESTADO_CAMBIADO', `${anterior} -> ${estado}`, ip);
}

/** Subir de tipo lo decide coordinación con motivo; bajarlo, solo un ADMIN (RN-15-02). Al subir se suman los pasos del nuevo protocolo. */
export async function reclasificarCaso(id: string, tipo: TipoSituacion, motivo: string, usuario: UserDocument, ip?: string | null) {
  const caso = await cargarCaso(id, usuario);
  exigirEditable(caso);
  if (tipo === caso.tipo_situacion) throw new ApiError(409, 'El caso ya tiene ese tipo.');
  if (!esEscalamiento(caso.tipo_situacion, tipo) && usuario.rol !== ROLES.ADMIN) {
    throw new ApiError(403, 'Solo un administrador puede bajar el tipo de un caso.');
  }

  caso.reclasificaciones.push({ de: caso.tipo_situacion, a: tipo, motivo: motivo.trim(), por: usuario._id, fecha: new Date() });
  caso.tipo_situacion = tipo;

  const protocolo = await ProtocoloConvivencia.findOne({ tipo_situacion: tipo });
  const nuevos = pasosFaltantes(caso.pasos, protocolo?.pasos ?? []);
  const base = caso.pasos.length;
  nuevos.forEach((p, i) => caso.pasos.push({ nombre: p.nombre, obligatorio: p.obligatorio, remite_a_orientacion: p.remite_a_orientacion, orden: base + i + 1, estado: 'PENDIENTE', fecha: null, por: null, nota: '' }));
  return guardarYAuditar(caso, usuario, 'CASO_CONVIVENCIA_RECLASIFICADO', `${caso.reclasificaciones.at(-1)?.de} -> ${tipo}`, ip);
}

export async function registrarAtencion(id: string, datos: { descripcion: string; hubo_dano?: boolean }, usuario: UserDocument, ip?: string | null) {
  const caso = await cargarCaso(id, usuario);
  exigirEditable(caso);
  caso.atencion_inmediata = { descripcion: datos.descripcion.trim(), hubo_dano: Boolean(datos.hubo_dano), fecha: new Date(), por: usuario._id };
  return guardarYAuditar(caso, usuario, 'CASO_CONVIVENCIA_ACTUALIZADO', 'atencion_inmediata', ip);
}

export async function actualizarPaso(id: string, pasoId: string, datos: { estado: 'PENDIENTE' | 'CUMPLIDO' | 'NO_APLICA'; nota?: string }, usuario: UserDocument, ip?: string | null) {
  const caso = await cargarCaso(id, usuario);
  exigirEditable(caso);
  const paso = caso.pasos.id(pasoId);
  if (!paso) throw new ApiError(404, 'Paso no encontrado.');
  paso.estado = datos.estado;
  paso.nota = (datos.nota ?? '').trim();
  paso.fecha = datos.estado === 'PENDIENTE' ? null : new Date();
  paso.por = datos.estado === 'PENDIENTE' ? null : usuario._id;

  // Cumplir un paso que el colegio marcó como "remite a orientación" remite a los afectados y presuntos responsables.
  let creadas = 0;
  const remite = datos.estado === 'CUMPLIDO' && paso.remite_a_orientacion;
  const vista = await guardarYAuditar(caso, usuario, 'CASO_CONVIVENCIA_ACTUALIZADO', 'paso', ip, remite ? async (session) => {
    creadas = await remitirAutomaticamente(caso, { tipo: 'PASO', id: String(paso._id), nombre: paso.nombre }, usuario, session);
  } : undefined);
  if (creadas > 0) await auditarRemisionesCreadas(usuario, caso, creadas, `paso «${paso.nombre}»`, ip);
  return vista;
}

// --- Registros del proceso ---

export const COLECCIONES_REGISTRO_CASO = ['seguimientos', 'notificaciones', 'descargos', 'medidas-proteccion', 'remisiones', 'medidas-aplicadas'] as const;
export type ColeccionRegistroCaso = (typeof COLECCIONES_REGISTRO_CASO)[number];

export interface DatosRegistroCaso {
  fecha: string;
  // seguimientos
  nota?: string;
  proxima_fecha?: string | null;
  // notificaciones
  tipo?: TipoNotificacionCaso;
  medio?: MedioCitacion;
  dirigida_a?: string;
  resultado?: string;
  // descargos
  parte?: ParteDescargo;
  student_id?: string;
  texto?: string;
  // medidas de protección
  descripcion?: string;
  // remisiones
  entidad_id?: string;
  oficio?: string;
  funcionario?: string;
  respuesta?: string;
  // medidas aplicadas
  medida_id?: string;
  dias?: number;
  observaciones?: string;
}

/** Cada colección valida sus campos en el validador; aquí solo las reglas que dependen de otros datos. */
export async function agregarRegistroCaso(id: string, coleccion: ColeccionRegistroCaso, d: DatosRegistroCaso, usuario: UserDocument, ip?: string | null) {
  const caso = await cargarCaso(id, usuario);
  exigirEditable(caso);
  const fecha = fechaDeClase(d.fecha);
  exigirFechaNoFutura(fecha, 'La fecha del registro');
  const por = usuario._id;
  let remitePor: { tipo: 'MEDIDA'; id: string; nombre: string } | null = null;

  switch (coleccion) {
    case 'seguimientos': {
      const proxima = d.proxima_fecha ? fechaDeClase(d.proxima_fecha) : null;
      if (proxima && proxima < fecha) throw new ApiError(400, 'La próxima fecha no puede ser anterior al seguimiento.');
      caso.seguimientos.push({ fecha, nota: (d.nota ?? '').trim(), proxima_fecha: proxima, por });
      break;
    }
    case 'notificaciones':
      caso.notificaciones.push({ tipo: d.tipo!, fecha, medio: d.medio!, dirigida_a: (d.dirigida_a ?? '').trim(), resultado: (d.resultado ?? '').trim(), por });
      break;
    case 'descargos': {
      if (d.parte === 'ESTUDIANTE' && (!d.student_id || !caso.involucrados.some((i) => String(i.student_id) === d.student_id))) {
        throw new ApiError(400, 'El descargo del estudiante debe indicar un estudiante involucrado en el caso.');
      }
      caso.descargos.push({ parte: d.parte!, student_id: d.student_id ? new Types.ObjectId(d.student_id) : null, fecha, texto: (d.texto ?? '').trim(), por });
      break;
    }
    case 'medidas-proteccion':
      caso.medidas_proteccion.push({ descripcion: (d.descripcion ?? '').trim(), fecha, por });
      break;
    case 'remisiones': {
      const entidad = await EntidadExterna.findOne({ _id: d.entidad_id, estado: { $ne: 'inactivo' } });
      if (!entidad) throw new ApiError(400, 'La entidad no existe o está inactiva.');
      caso.remisiones.push({
        entidad_id: entidad._id,
        entidad_nombre: entidad.nombre,
        fecha,
        oficio: (d.oficio ?? '').trim(),
        funcionario: (d.funcionario ?? '').trim(),
        respuesta: (d.respuesta ?? '').trim(),
        por,
      });
      break;
    }
    case 'medidas-aplicadas': {
      const medida = await MedidaConvivencia.findOne({ _id: d.medida_id, estado: { $ne: 'inactivo' } });
      if (!medida) throw new ApiError(400, 'La medida no existe o está inactiva.');
      if (medida.se_aplica_por_dias && !(d.dias && d.dias > 0)) throw new ApiError(400, 'Esta medida se aplica por días: indica cuántos.');
      caso.medidas_aplicadas.push({ medida_id: medida._id, nombre: medida.nombre, dias: medida.se_aplica_por_dias ? (d.dias ?? null) : null, observaciones: (d.observaciones ?? '').trim(), fecha, por });
      // Una medida que el colegio marcó como "remite a orientación" remite a los afectados y presuntos responsables.
      if (medida.remite_a_orientacion) remitePor = { tipo: 'MEDIDA', id: String(medida._id), nombre: medida.nombre };
      break;
    }
  }
  let creadas = 0;
  const origen = remitePor;
  const vista = await guardarYAuditar(caso, usuario, 'CASO_CONVIVENCIA_ACTUALIZADO', coleccion, ip, origen ? async (session) => {
    creadas = await remitirAutomaticamente(caso, origen, usuario, session);
  } : undefined);
  if (creadas > 0 && origen) await auditarRemisionesCreadas(usuario, caso, creadas, `medida «${origen.nombre}»`, ip);
  return vista;
}

/** Convivencia remite a orientación, a mano, a estudiantes del caso (además de las remisiones automáticas de medidas y pasos). */
export async function remitirAOrientacion(id: string, datos: { student_ids: string[]; motivo: string }, usuario: UserDocument, ip?: string | null) {
  const caso = await cargarCaso(id, usuario);
  exigirEditable(caso);
  const creadas = await runTransaction((session) => remitirManualmente(caso, datos.student_ids, datos.motivo, usuario, session));
  await auditarRemisionesCreadas(usuario, caso, creadas, 'manual', ip);
  return vistaCaso(caso);
}

/** La decisión es motivada y solo se toma después de oír los descargos (RN-15-04/05). */
export async function registrarDecision(id: string, datos: { motivacion: string; faltas_ids?: string[] }, usuario: UserDocument, ip?: string | null) {
  const caso = await cargarCaso(id, usuario);
  exigirEditable(caso);
  if (caso.descargos.length === 0) throw new ApiError(409, 'Registra los descargos del estudiante y su acudiente antes de la decisión.');

  const ids = [...new Set(datos.faltas_ids ?? [])];
  const faltas = ids.length ? await FaltaConvivencia.find({ _id: { $in: ids } }) : [];
  if (faltas.length !== ids.length) throw new ApiError(400, 'Alguna de las faltas del manual no existe.');

  caso.decision = {
    motivacion: datos.motivacion.trim(),
    fecha: new Date(),
    por: usuario._id,
    faltas: faltas.map((f) => ({ falta_id: f._id, codigo: f.codigo, descripcion: f.descripcion, gravedad: f.gravedad })),
  };
  return guardarYAuditar(caso, usuario, 'CASO_CONVIVENCIA_ACTUALIZADO', 'decision', ip);
}

// --- Cierre, reapertura, anulación ---

export interface CerrarCasoInput {
  resultado: ResultadoCierreCaso;
  motivo: string;
  justificacion_sin_remision?: string;
}

export async function cerrarCaso(id: string, input: CerrarCasoInput, usuario: UserDocument, ip?: string | null) {
  const caso = await cargarCaso(id, usuario);
  exigirEditable(caso);
  if (!ESTADOS_CASO_CERRABLES.includes(caso.estado)) {
    throw new ApiError(409, `Un caso ${caso.estado} no se puede cerrar: avanza primero el proceso (atención, mediación o seguimiento).`);
  }
  if (input.justificacion_sin_remision?.trim()) caso.justificacion_sin_remision = input.justificacion_sin_remision.trim();

  const faltan = pendientesParaCerrar(caso, input.resultado);
  if (faltan.length > 0) throw new ApiError(409, `No se puede cerrar el caso. ${faltan.join(' ')}`, faltan);

  caso.estado = 'CERRADO';
  caso.resultado_cierre = input.resultado;
  caso.cierre = { motivo: input.motivo.trim(), por: usuario._id, fecha: new Date() };
  return guardarYAuditar(caso, usuario, 'CASO_CONVIVENCIA_CERRADO', input.resultado, ip);
}

/** Solo un ADMIN reabre, con motivo (patrón de reabrir un periodo en M05). */
export async function reabrirCaso(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo un administrador reabre un caso.');
  const caso = await cargarCaso(id, usuario);
  if (caso.estado !== 'CERRADO') throw new ApiError(409, 'Solo se reabre un caso cerrado.');
  caso.reaperturas.push({ motivo: motivo.trim(), por: usuario._id, fecha: new Date() });
  caso.estado = 'REABIERTO';
  caso.resultado_cierre = null;
  caso.cierre = null;
  return guardarYAuditar(caso, usuario, 'CASO_CONVIVENCIA_REABIERTO', 'reabierto', ip);
}

/** Error de apertura: solo un ADMIN, con motivo, y solo mientras no se ha trabajado el caso. La solicitud de origen vuelve a la bandeja. */
export async function anularCaso(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo un administrador anula un caso.');
  const caso = await cargarCaso(id, usuario);
  if (caso.estado !== 'ABIERTO') throw new ApiError(409, 'Solo se anula un caso recién abierto.');
  if (await RemisionOrientacion.exists({ caso_id: caso._id })) throw new ApiError(409, 'El caso ya remitió estudiantes a orientación: no se puede anular.');
  caso.estado = 'ANULADO';
  caso.anulacion = { motivo: motivo.trim(), por: usuario._id, fecha: new Date() };
  await SolicitudCaso.updateOne({ _id: caso.solicitud_id, caso_id: caso._id }, { $set: { estado: 'PENDIENTE', caso_id: null, resolucion: null } });
  return guardarYAuditar(caso, usuario, 'CASO_CONVIVENCIA_ANULADO', 'anulado', ip);
}

// --- Conflicto de interés ---

/**
 * Quien tiene un conflicto de interés se aparta del caso (RN-15-11): se declara impedido él mismo, o un ADMIN aparta a un
 * coordinador de convivencia. Un ADMIN no se aparta: siempre puede ver el caso para auditarlo.
 */
export async function declararImpedimento(id: string, datos: { usuario_id?: string; motivo: string }, usuario: UserDocument, ip?: string | null) {
  const caso = await cargarCaso(id, usuario);
  const objetivoId = datos.usuario_id ?? String(usuario._id);
  if (objetivoId !== String(usuario._id) && usuario.rol !== ROLES.ADMIN) {
    throw new ApiError(403, 'Solo un administrador aparta a otra persona del caso.');
  }
  const objetivo = await User.findOne({ _id: objetivoId, rol: ROLES.COORDINADOR_CONVIVENCIA });
  if (!objetivo) throw new ApiError(400, 'Solo se aparta a un coordinador de convivencia (el administrador siempre puede auditar el caso).');
  if (caso.impedidos.some((i) => String(i.usuario_id) === objetivoId)) throw new ApiError(409, 'Esa persona ya está apartada de este caso.');

  caso.impedidos.push({ usuario_id: objetivo._id, motivo: datos.motivo.trim(), por: usuario._id, fecha: new Date() });
  await caso.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CASO_CONVIVENCIA_IMPEDIMENTO', entidad: 'CasoConvivencia', entidad_id: caso._id, ip });
  // Quien se aparta ya no debe ver el caso: se responde sin su contenido.
  return objetivoId === String(usuario._id) && usuario.rol !== ROLES.ADMIN ? { apartado: true } : vistaCaso(caso);
}

/** Casos abiertos de las sedes del usuario que tienen alguna alerta calculada (remisión tipo III vencida, seguimiento vencido). */
export async function casosConAlertas(usuario: UserDocument) {
  if (!ROLES_CONVIVENCIA.includes(usuario.rol)) throw new ApiError(403, 'Solo convivencia consulta las alertas.');
  const alcance = alcanceDeSedes(comoUsuarioConvivencia(usuario));
  const filtro: Record<string, unknown> = {
    estado: { $nin: ESTADOS_CASO_FINALES },
    'impedidos.usuario_id': { $ne: usuario._id },
    ...(alcance === 'TODAS' ? {} : { sede_id: { $in: alcance } }),
  };
  const [casos, configuracion] = await Promise.all([
    CasoConvivencia.find(filtro).select('codigo estado tipo_situacion remisiones justificacion_sin_remision seguimientos createdAt'),
    obtenerConfiguracion(),
  ]);
  const ahora = new Date();
  const hoy = hoyColombia();
  return casos
    .map((c) => ({ _id: String(c._id), codigo: c.codigo, estado: c.estado, tipo_situacion: c.tipo_situacion, alertas: alertasDeCaso(c, configuracion, ahora, hoy) }))
    .filter((c) => c.alertas.length > 0);
}
