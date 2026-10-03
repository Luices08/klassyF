import { Types } from 'mongoose';
import { TipoSesionComite } from '../constants/convivencia';
import { EstadoUsuario } from '../constants/enums';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import { MiembroComite, MiembroComiteDocument, SesionComite, SesionComiteDocument } from '../models/comiteConvivencia.model';
import Counter from '../models/counter.model';
import { UserDocument } from '../models/user.model';
import { User } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { calcularQuorum, hashDeActa, quorumDeCaso } from '../utils/comiteConvivencia';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import runTransaction from '../utils/runTransaction';
import { fechaDeClase, hoyColombia } from './attendance.service';
import { registrarEvento } from './audit.service';
import { cargarCaso } from './caso.service';
import { obtenerConfiguracion } from './convivenciaCatalogo.service';

const ROLES_CONVIVENCIA: string[] = [ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA];

function exigirConvivencia(usuario: UserDocument) {
  if (!ROLES_CONVIVENCIA.includes(usuario.rol)) throw new ApiError(403, 'Solo convivencia gestiona el comité.');
}

/** El año que se indica o, si no, el vigente (o el más reciente): el comité se designa por año lectivo. */
async function resolverAnio(anioId?: string) {
  const anio = anioId
    ? await AcademicYear.findById(anioId)
    : ((await AcademicYear.findOne({ estado: 'EN_CURSO' })) ?? (await AcademicYear.findOne().sort({ year: -1 })));
  if (!anio) throw new ApiError(409, 'No hay un año lectivo configurado.');
  return anio;
}

// --- Miembros ---

export async function listarMiembros(usuario: UserDocument, anioId?: string, incluirInactivos = false) {
  exigirConvivencia(usuario);
  const anio = await resolverAnio(anioId);
  const miembros = await MiembroComite.find({ academic_year_id: anio._id, ...(incluirInactivos ? {} : { estado: ESTADO_ACTIVO }) }).sort({ es_presidente: -1, cargo: 1, nombre: 1 });
  return { anio: { _id: String(anio._id), year: anio.year }, miembros };
}

export interface DatosMiembro {
  cargo: string;
  nombre: string;
  usuario_id?: string | null;
  documento?: string;
  es_presidente?: boolean;
}

async function liberarPresidente(anioId: Types.ObjectId, exceptoId?: Types.ObjectId) {
  await MiembroComite.updateMany(
    { academic_year_id: anioId, es_presidente: true, ...(exceptoId ? { _id: { $ne: exceptoId } } : {}) },
    { $set: { es_presidente: false } }
  );
}

/** Si el miembro es un usuario del sistema, el nombre sale de su cuenta: así no hay dos fuentes de verdad. */
async function datosDeMiembro(d: Partial<DatosMiembro>): Promise<Partial<DatosMiembro>> {
  if (!d.usuario_id) return d;
  const usuario = await User.findOne({ _id: d.usuario_id, estado: ESTADO_ACTIVO });
  if (!usuario) throw new ApiError(400, 'El usuario indicado no existe o está inactivo.');
  return { ...d, nombre: `${usuario.nombre} ${usuario.apellido}`, documento: usuario.numero_documento };
}

export async function crearMiembro(input: DatosMiembro, usuario: UserDocument, anioId?: string, ip?: string | null) {
  exigirConvivencia(usuario);
  const anio = await resolverAnio(anioId);
  if (anio.estado === 'CERRADO') throw new ApiError(409, 'El año lectivo está cerrado: el comité de ese año es histórico.');

  const datos = await datosDeMiembro(input);
  const miembro = new MiembroComite({ ...datos, usuario_id: input.usuario_id ?? null, academic_year_id: anio._id });
  try {
    await miembro.save();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'Ese usuario ya es miembro del comité de este año.');
    throw err;
  }
  if (miembro.es_presidente) await liberarPresidente(anio._id, miembro._id);
  await registrarEvento({ usuario_id: usuario._id, accion: 'MIEMBRO_COMITE_CREADO', entidad: 'MiembroComite', entidad_id: miembro._id, detalle: miembro.cargo, ip });
  return miembro;
}

async function cargarMiembro(id: string): Promise<MiembroComiteDocument> {
  const miembro = Types.ObjectId.isValid(id) ? await MiembroComite.findById(id) : null;
  if (!miembro) throw new ApiError(404, 'Miembro no encontrado.');
  return miembro;
}

export async function actualizarMiembro(id: string, input: Partial<DatosMiembro>, usuario: UserDocument, ip?: string | null) {
  exigirConvivencia(usuario);
  const miembro = await cargarMiembro(id);
  miembro.set(await datosDeMiembro({ ...input, usuario_id: input.usuario_id !== undefined ? input.usuario_id : (miembro.usuario_id ? String(miembro.usuario_id) : null) }));
  await miembro.save();
  if (miembro.es_presidente) await liberarPresidente(miembro.academic_year_id, miembro._id);
  await registrarEvento({ usuario_id: usuario._id, accion: 'MIEMBRO_COMITE_ACTUALIZADO', entidad: 'MiembroComite', entidad_id: miembro._id, detalle: Object.keys(input).join(', '), ip });
  return miembro;
}

export async function cambiarEstadoMiembro(id: string, estado: EstadoUsuario, usuario: UserDocument, ip?: string | null) {
  exigirConvivencia(usuario);
  const miembro = await cargarMiembro(id);
  miembro.estado = estado;
  if (estado === 'inactivo') miembro.es_presidente = false;
  await miembro.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'MIEMBRO_COMITE_ACTUALIZADO', entidad: 'MiembroComite', entidad_id: miembro._id, detalle: estado, ip });
  return miembro;
}

export async function eliminarMiembro(id: string, usuario: UserDocument, ip?: string | null) {
  exigirConvivencia(usuario);
  const miembro = await cargarMiembro(id);
  if (await SesionComite.exists({ 'asistentes.miembro_id': miembro._id })) {
    throw new ApiError(409, 'El miembro figura en actas: desactívalo en lugar de eliminarlo.');
  }
  await miembro.deleteOne();
  await registrarEvento({ usuario_id: usuario._id, accion: 'MIEMBRO_COMITE_ELIMINADO', entidad: 'MiembroComite', entidad_id: miembro._id, ip });
}

// --- Sesiones y actas ---

export async function listarSesiones(usuario: UserDocument, anioId?: string) {
  exigirConvivencia(usuario);
  const anio = await resolverAnio(anioId);
  const sesiones = await SesionComite.find({ academic_year_id: anio._id }).sort({ fecha: -1, createdAt: -1 }).select('-asistentes -casos_tratados -desarrollo -orden_del_dia');
  return { anio: { _id: String(anio._id), year: anio.year }, sesiones };
}

async function cargarSesion(id: string): Promise<SesionComiteDocument> {
  const sesion = Types.ObjectId.isValid(id) ? await SesionComite.findById(id) : null;
  if (!sesion) throw new ApiError(404, 'Sesión no encontrada.');
  return sesion;
}

export async function obtenerSesion(id: string, usuario: UserDocument) {
  exigirConvivencia(usuario);
  return cargarSesion(id);
}

export interface DatosSesion {
  tipo: TipoSesionComite;
  fecha: string;
  hora?: string;
  lugar?: string;
  orden_del_dia?: string;
}

export async function crearSesion(input: DatosSesion, usuario: UserDocument, ip?: string | null) {
  exigirConvivencia(usuario);
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' });
  if (!anio) throw new ApiError(409, 'No hay un año lectivo en curso: el comité sesiona en el año vigente.');
  const fecha = fechaDeClase(input.fecha);
  if (fecha > hoyColombia()) throw new ApiError(400, 'El acta se levanta de una sesión ya realizada: la fecha no puede ser futura.');

  const miembros = await MiembroComite.find({ academic_year_id: anio._id, estado: ESTADO_ACTIVO }).sort({ es_presidente: -1, cargo: 1, nombre: 1 });
  if (miembros.length === 0) throw new ApiError(409, 'Registra primero los miembros del comité de este año.');
  const configuracion = await obtenerConfiguracion();

  const sesion = await SesionComite.create({
    academic_year_id: anio._id,
    anio: anio.year,
    tipo: input.tipo,
    fecha,
    hora: input.hora ?? '',
    lugar: input.lugar ?? '',
    orden_del_dia: input.orden_del_dia ?? '',
    asistentes: miembros.map((m) => ({ miembro_id: m._id, nombre: m.nombre, cargo: m.cargo, es_presidente: m.es_presidente, asistio: false })),
    quorum: calcularQuorum(miembros.length, 0, configuracion.quorum_porcentaje),
    creado_por: usuario._id,
  });
  await registrarEvento({ usuario_id: usuario._id, accion: 'SESION_COMITE_CREADA', entidad: 'SesionComite', entidad_id: sesion._id, ip });
  return sesion;
}

export interface ActualizarSesionInput {
  tipo?: TipoSesionComite;
  fecha?: string;
  hora?: string;
  lugar?: string;
  orden_del_dia?: string;
  desarrollo?: string;
  asistencia?: { miembro_id: string; asistio: boolean }[];
  casos_tratados?: { caso_id: string; decisiones?: string; recusados_ids?: string[] }[];
}

function exigirBorrador(sesion: SesionComiteDocument) {
  if (sesion.estado !== 'BORRADOR') {
    throw new ApiError(409, sesion.estado === 'FIRMADA' ? 'El acta está firmada y es inmutable: agrega un anexo.' : 'La sesión está anulada.');
  }
}

export async function actualizarSesion(id: string, input: ActualizarSesionInput, usuario: UserDocument, ip?: string | null) {
  exigirConvivencia(usuario);
  const sesion = await cargarSesion(id);
  exigirBorrador(sesion);

  if (input.fecha) {
    const fecha = fechaDeClase(input.fecha);
    if (fecha > hoyColombia()) throw new ApiError(400, 'La fecha de la sesión no puede ser futura.');
    sesion.fecha = fecha;
  }
  for (const campo of ['tipo', 'hora', 'lugar', 'orden_del_dia', 'desarrollo'] as const) {
    if (input[campo] !== undefined) sesion.set(campo, input[campo]);
  }

  if (input.asistencia) {
    const asistio = new Map(input.asistencia.map((a) => [a.miembro_id, a.asistio]));
    for (const id of asistio.keys()) {
      if (!sesion.asistentes.some((a) => String(a.miembro_id) === id)) throw new ApiError(400, 'Alguien de la asistencia no es miembro del comité en esta sesión.');
    }
    sesion.asistentes.forEach((a) => {
      const marca = asistio.get(String(a.miembro_id));
      if (marca !== undefined) a.asistio = marca;
    });
  }

  if (input.casos_tratados) {
    const vistos = new Set<string>();
    const tratados = [];
    for (const pedido of input.casos_tratados) {
      if (vistos.has(pedido.caso_id)) continue;
      vistos.add(pedido.caso_id);
      const caso = await cargarCaso(pedido.caso_id, usuario);
      const recusados = new Set(pedido.recusados_ids ?? []);
      for (const r of recusados) {
        if (!sesion.asistentes.some((a) => String(a.miembro_id) === r)) throw new ApiError(400, 'Un recusado no es miembro del comité en esta sesión.');
      }
      // Un miembro que es usuario y se declaró impedido en el caso queda recusado sí o sí (RN-15-11).
      const impedidos = new Set(caso.impedidos.map((i) => String(i.usuario_id)));
      const miembrosImpedidos = await MiembroComite.find({ _id: { $in: sesion.asistentes.map((a) => a.miembro_id) }, usuario_id: { $in: [...impedidos] } }).select('_id');
      miembrosImpedidos.forEach((m) => recusados.add(String(m._id)));

      tratados.push({ caso_id: caso._id, codigo: caso.codigo, decisiones: (pedido.decisiones ?? '').trim(), recusados_ids: [...recusados].map((r) => new Types.ObjectId(r)) });
    }
    sesion.set('casos_tratados', tratados);
  }

  const configuracion = await obtenerConfiguracion();
  sesion.quorum = calcularQuorum(sesion.asistentes.length, sesion.asistentes.filter((a) => a.asistio).length, configuracion.quorum_porcentaje);
  await sesion.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'SESION_COMITE_ACTUALIZADA', entidad: 'SesionComite', entidad_id: sesion._id, ip });
  return sesion;
}

/** El contenido que se sella con la firma: todo lo que el acta dice, sin los campos de control. */
function contenidoFirmable(sesion: SesionComiteDocument, codigo: string) {
  return {
    codigo,
    anio: sesion.anio,
    tipo: sesion.tipo,
    fecha: sesion.fecha,
    hora: sesion.hora,
    lugar: sesion.lugar,
    orden_del_dia: sesion.orden_del_dia,
    desarrollo: sesion.desarrollo,
    asistentes: sesion.asistentes.map((a) => ({ miembro_id: String(a.miembro_id), nombre: a.nombre, cargo: a.cargo, asistio: a.asistio })),
    casos_tratados: sesion.casos_tratados.map((c) => ({ codigo: c.codigo, decisiones: c.decisiones, recusados_ids: c.recusados_ids.map(String) })),
  };
}

export async function firmarSesion(id: string, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el rector (administrador) firma el acta.');
  const sesion = await cargarSesion(id);
  exigirBorrador(sesion);

  const configuracion = await obtenerConfiguracion();
  const quorum = calcularQuorum(sesion.asistentes.length, sesion.asistentes.filter((a) => a.asistio).length, configuracion.quorum_porcentaje);
  if (!quorum.alcanzado) throw new ApiError(409, `No hay quórum: asistieron ${quorum.presentes} de ${quorum.total_miembros} miembros.`);
  if (sesion.desarrollo.trim().length < 10) throw new ApiError(409, 'Describe el desarrollo de la sesión antes de firmar el acta.');

  const asistentes = sesion.asistentes.map((a) => ({ miembro_id: String(a.miembro_id), asistio: a.asistio }));
  for (const tratado of sesion.casos_tratados) {
    const delCaso = quorumDeCaso(asistentes, tratado.recusados_ids.map(String), configuracion.quorum_porcentaje);
    if (!delCaso.alcanzado) {
      throw new ApiError(409, `El caso ${tratado.codigo} no tiene quórum para deliberar una vez apartados los recusados.`);
    }
  }

  await runTransaction(async (session) => {
    // Consecutivo anual sin huecos: nace al firmar, dentro de la misma transacción.
    const contador = await Counter.findByIdAndUpdate(`ACTA-${sesion.anio}`, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
    const consecutivo = contador?.seq ?? 0;
    const codigo = `AC-${sesion.anio}-${String(consecutivo).padStart(3, '0')}`;
    const fecha = new Date();
    sesion.quorum = quorum;
    sesion.consecutivo = consecutivo;
    sesion.codigo = codigo;
    sesion.firma = { por: usuario._id, fecha, hash: hashDeActa(contenidoFirmable(sesion, codigo)) };
    sesion.estado = 'FIRMADA';
    await sesion.save({ session });
  });

  await registrarEvento({ usuario_id: usuario._id, accion: 'ACTA_COMITE_FIRMADA', entidad: 'SesionComite', entidad_id: sesion._id, detalle: sesion.codigo, ip });
  return sesion;
}

/** Recalcula la huella del acta y la compara con la sellada al firmar: detecta una alteración directa en la base. */
export async function verificarIntegridad(id: string, usuario: UserDocument) {
  exigirConvivencia(usuario);
  const sesion = await cargarSesion(id);
  if (sesion.estado !== 'FIRMADA' || !sesion.firma || !sesion.codigo) throw new ApiError(409, 'Solo un acta firmada tiene huella.');
  const actual = hashDeActa(contenidoFirmable(sesion, sesion.codigo));
  return { codigo: sesion.codigo, hash_firmado: sesion.firma.hash, hash_actual: actual, integra: actual === sesion.firma.hash };
}

export async function agregarAnexo(id: string, texto: string, usuario: UserDocument, ip?: string | null) {
  exigirConvivencia(usuario);
  const sesion = await cargarSesion(id);
  if (sesion.estado !== 'FIRMADA') throw new ApiError(409, 'Solo se anexa a un acta firmada; un borrador se edita.');
  sesion.anexos.push({ fecha: new Date(), por: usuario._id, texto: texto.trim() });
  await sesion.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'ACTA_COMITE_ANEXO', entidad: 'SesionComite', entidad_id: sesion._id, ip });
  return sesion;
}

/** Un borrador equivocado se anula con motivo (no deja hueco: el consecutivo nace al firmar). Un acta firmada no se anula. */
export async function anularSesion(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  exigirConvivencia(usuario);
  const sesion = await cargarSesion(id);
  exigirBorrador(sesion);
  sesion.estado = 'ANULADA';
  sesion.anulacion = { motivo: motivo.trim(), por: usuario._id, fecha: new Date() };
  await sesion.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'SESION_COMITE_ANULADA', entidad: 'SesionComite', entidad_id: sesion._id, ip });
  return sesion;
}
