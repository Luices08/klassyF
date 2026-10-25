import { Types } from 'mongoose';
import { EstadoEsperaRematricula } from '../constants/rematricula';
import { ROLES } from '../constants/roles';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import ListaEsperaRematricula from '../models/listaEsperaRematricula.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { runTransaction } from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { crearPreMatricula } from './rolloverPromocion.service';

const PUEDEN_CONSULTAR = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];
/** La asignación manual es una decisión directiva. */
const PUEDEN_RESOLVER = [ROLES.ADMIN, ROLES.COORDINADOR];

export interface FiltrosListaEspera {
  destino_id: string;
  sede_id?: string;
  grade_id?: string;
  estado?: EstadoEsperaRematricula;
}

const alcanceDeSedes = (usuario: UserDocument): 'TODAS' | string[] => (usuario.rol === ROLES.SECRETARIA ? usuario.sedes_ids.map(String) : 'TODAS');

/** La lista de espera de un año de destino, en el orden de prioridad de cada sede y grado, con los grupos que hoy tienen cupo para asignar a mano. */
export async function listarEspera(f: FiltrosListaEspera, usuario: UserDocument) {
  if (!PUEDEN_CONSULTAR.includes(usuario.rol)) throw new ApiError(403, 'No tienes acceso a la lista de espera de rematrícula.');
  const alcance = alcanceDeSedes(usuario);
  if (alcance !== 'TODAS' && f.sede_id && !alcance.includes(f.sede_id)) throw new ApiError(403, 'Esa sede no está entre las que tienes asignadas.');
  const destino = await cargarAnio(f.destino_id);

  const filas = await ListaEsperaRematricula.find({
    destino_academic_year_id: destino._id,
    estado: f.estado ?? 'EN_ESPERA',
    ...(f.sede_id ? { sede_id: f.sede_id } : {}),
    ...(f.grade_id ? { grado_destino_id: f.grade_id } : {}),
    ...(alcance !== 'TODAS' ? { sede_id: { $in: f.sede_id ? [f.sede_id] : alcance } } : {}),
  })
    .sort({ sede_id: 1, grado_destino_id: 1, posicion: 1 })
    .populate<{ student_id: { nombre: string; apellido: string; numero_documento: string } | null }>('student_id', 'nombre apellido numero_documento')
    .lean();

  const [grados, grupos] = await Promise.all([
    Grade.find({ _id: { $in: filas.map((x) => x.grado_destino_id) } }).select('nombre').lean(),
    Group.find({ academic_year_id: destino._id, estado: 'ACTIVE' }).lean(),
  ]);
  const nombreGrado = new Map(grados.map((g) => [String(g._id), g.nombre]));
  const conCupo = (sedeId: Types.ObjectId, gradoId: Types.ObjectId) =>
    grupos
      .filter((g) => String(g.sede_id) === String(sedeId) && String(g.grade_id) === String(gradoId) && g.cupos_ocupados < g.max_capacity)
      .map((g) => ({ id: String(g._id), nombre: `${nombreGrado.get(String(gradoId)) ?? ''} ${g.nomenclatura}`.trim(), libres: g.max_capacity - g.cupos_ocupados }));

  return filas.map((x) => ({
    _id: String(x._id),
    estudiante: { _id: String(x.student_id ? (x.student_id as unknown as { _id: Types.ObjectId })._id : ''), nombre: x.student_id?.nombre ?? '', apellido: x.student_id?.apellido ?? '', numero_documento: x.student_id?.numero_documento ?? '' },
    estado: x.estado,
    posicion: x.posicion,
    grado_destino: nombreGrado.get(String(x.grado_destino_id)) ?? '',
    grupo_origen: x.grupo_origen,
    tipo_ingreso: x.tipo_ingreso,
    motivo: x.motivo,
    sede_id: String(x.sede_id),
    grupos_con_cupo: x.estado === 'EN_ESPERA' ? conCupo(x.sede_id, x.grado_destino_id) : [],
  }));
}

/**
 * Asigna a mano a quien espera cupo a un grupo del año siguiente que tenga lugar (decisión de coordinación o del administrador). Crea la
 * misma pre-matrícula de la rematrícula: el cupo se aparta con la actualización condicionada, así que un grupo lleno responde 409.
 */
export async function asignarDesdeEspera(id: string, groupId: string, usuario: UserDocument, ip?: string | null) {
  if (!PUEDEN_RESOLVER.includes(usuario.rol)) throw new ApiError(403, 'La asignación desde la lista de espera es de coordinación o del administrador.');
  const espera = await ListaEsperaRematricula.findById(id);
  if (!espera) throw new ApiError(404, 'Registro de la lista de espera no encontrado.');
  if (espera.estado !== 'EN_ESPERA') throw new ApiError(409, `Este registro ya está ${espera.estado === 'ASIGNADA' ? 'asignado' : 'descartado'}.`);

  const destino = await cargarAnio(String(espera.destino_academic_year_id));
  if (destino.estado === 'CERRADO') throw new ApiError(409, `El año ${destino.year} ya está cerrado: no admite pre-matrículas.`);
  const grupo = await Group.findOne({ _id: groupId, academic_year_id: destino._id, estado: 'ACTIVE' });
  if (!grupo || String(grupo.sede_id) !== String(espera.sede_id) || String(grupo.grade_id) !== String(espera.grado_destino_id)) {
    throw new ApiError(409, 'Elige un grupo activo del mismo grado y sede, en el año siguiente.');
  }
  const grado = await Grade.findById(grupo.grade_id).select('nombre').lean();
  const nombreDestino = `${grado?.nombre ?? ''} ${grupo.nomenclatura}`.trim();

  const matriculaId = await runTransaction(async (session) => {
    const nueva = await crearPreMatricula(
      { student_id: String(espera.student_id), tipo_ingreso: espera.tipo_ingreso, grupo_destino_id: String(grupo._id), grupo_origen: espera.grupo_origen, grupo_destino: nombreDestino },
      destino,
      session
    );
    const marcada = await ListaEsperaRematricula.updateOne(
      { _id: espera._id, estado: 'EN_ESPERA' },
      { $set: { estado: 'ASIGNADA', enrollment_id: nueva, resuelta_por: usuario._id, resuelta_at: new Date(), motivo: `Asignado a ${nombreDestino}.` } },
      { session }
    );
    if (marcada.modifiedCount !== 1) throw new ApiError(409, 'Otra persona ya resolvió este registro.');
    return nueva;
  });

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'REMATRICULA_ESPERA_ASIGNADA',
    entidad: 'Enrollment',
    entidad_id: matriculaId,
    detalle: `Lista de espera -> ${nombreDestino} (${espera.tipo_ingreso}).`,
    ip,
  });
  return { enrollment_id: String(matriculaId), grupo: nombreDestino };
}

/** Saca a alguien de la lista de espera sin darle cupo (p. ej. desistió). El motivo queda en el registro. */
export async function descartarDeEspera(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  if (!PUEDEN_RESOLVER.includes(usuario.rol)) throw new ApiError(403, 'Descartar de la lista de espera es de coordinación o del administrador.');
  const resuelta = await ListaEsperaRematricula.findOneAndUpdate(
    { _id: id, estado: 'EN_ESPERA' },
    { $set: { estado: 'DESCARTADA', resuelta_por: usuario._id, resuelta_at: new Date(), motivo: motivo.trim() } },
    { new: true }
  );
  if (!resuelta) throw new ApiError(404, 'No hay un registro en espera con ese identificador.');
  await registrarEvento({ usuario_id: usuario._id, accion: 'REMATRICULA_ESPERA_DESCARTADA', entidad: 'ListaEsperaRematricula', entidad_id: resuelta._id, detalle: 'Descartado de la lista de espera.', ip });
  return { _id: String(resuelta._id), estado: resuelta.estado };
}

