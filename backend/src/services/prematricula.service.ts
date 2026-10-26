import { ClientSession, Types } from 'mongoose';
import { ESTADOS_MATRICULA_VIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import AdmissionRequest, { AdmissionRequestDocument } from '../models/admissionRequest.model';
import Campus from '../models/campus.model';
import ConfiguracionPrematricula, { ConfiguracionPrematriculaDocument } from '../models/configuracionPrematricula.model';
import ConfirmacionContinuidad from '../models/confirmacionContinuidad.model';
import Counter from '../models/counter.model';
import Enrollment from '../models/enrollment.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import JornadaOperativa from '../models/jornadaOperativa.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { claveDeCubeta, calcularCupos, decidirReserva, FilaDeCupos, reservaVigente, ventanaAbierta } from '../utils/prematricula';
import { runTransaction } from '../utils/runTransaction';
import { registrarEvento } from './audit.service';

/**
 * Prematrícula (M04): las solicitudes de admisión que llegan mientras la ventana del año siguiente está abierta apuntan a ese año, y a las que se aceptan
 * se les **reserva cupo por grado, sede y jornada** (sin grupo, cuenta ni matrícula: el grupo se elige al matricular). Los cupos se calculan en vivo de los
 * grupos y las reservas; nunca hay un contador guardado que pueda desfasarse. El orden es el de inscripción: quien no cabe espera, y nadie se salta la fila.
 */

const PUEDEN_CONFIGURAR = [ROLES.ADMIN, ROLES.SECRETARIA];
const ESTADOS_QUE_PUEDEN_RESERVAR = ['PENDIENTE', 'EN_REVISION', 'EN_ESPERA'];

/** Un día de calendario a medianoche UTC, como se guardan las fechas del sistema. */
const diaDeCalendario = (valor: Date | string): Date => {
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export interface VistaVentana {
  desde: Date;
  hasta: Date;
  fecha_limite_matricula: Date | null;
  abierta: boolean;
}

const vistaDeVentana = (c: ConfiguracionPrematriculaDocument, ahora: Date): VistaVentana => ({
  desde: c.desde,
  hasta: c.hasta,
  fecha_limite_matricula: c.fecha_limite_matricula,
  abierta: ventanaAbierta(c, ahora),
});

export async function obtenerVentana(anioId: string, ahora: Date = new Date()): Promise<VistaVentana | null> {
  const config = await ConfiguracionPrematricula.findOne({ academic_year_id: anioId });
  return config ? vistaDeVentana(config, ahora) : null;
}

export interface DatosVentana {
  desde: string | Date;
  hasta: string | Date;
  fecha_limite_matricula?: string | Date | null;
}

/** Fija la ventana de prematrícula de un año (ADMIN y secretaría): del primer al último día, y hasta cuándo se matricula a quien reservó. */
export async function guardarVentana(anioId: string, datos: DatosVentana, usuario: UserDocument, ip?: string | null): Promise<VistaVentana> {
  if (!PUEDEN_CONFIGURAR.includes(usuario.rol)) throw new ApiError(403, 'Solo el administrador y la secretaría configuran la prematrícula.');
  const anio = await AcademicYear.findById(anioId).select('year estado');
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (anio.estado === 'CERRADO') throw new ApiError(409, `El año ${anio.year} ya está cerrado: no admite prematrícula.`);

  const desde = diaDeCalendario(datos.desde);
  const hasta = diaDeCalendario(datos.hasta);
  const limite = datos.fecha_limite_matricula ? diaDeCalendario(datos.fecha_limite_matricula) : null;
  if (hasta.getTime() < desde.getTime()) throw new ApiError(400, 'El cierre de la prematrícula no puede ser anterior a su apertura.');
  if (limite && limite.getTime() < hasta.getTime()) throw new ApiError(400, 'El último día para matricular no puede ser anterior al cierre de la prematrícula.');

  const config = await ConfiguracionPrematricula.findOneAndUpdate(
    { academic_year_id: anioId },
    { $set: { desde, hasta, fecha_limite_matricula: limite, actualizado_por: usuario._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'PREMATRICULA_CONFIGURADA',
    entidad: 'AcademicYear',
    entidad_id: anio._id,
    detalle: `Año ${anio.year}: del ${desde.toISOString().slice(0, 10)} al ${hasta.toISOString().slice(0, 10)}${limite ? `, matrícula hasta el ${limite.toISOString().slice(0, 10)}` : ''}`,
    ip,
  });
  return vistaDeVentana(config as ConfiguracionPrematriculaDocument, new Date());
}

/** El año (no cerrado) cuya ventana de prematrícula está abierta ahora, o null si ninguna lo está. */
export async function anioConVentanaAbierta(ahora: Date = new Date()): Promise<Types.ObjectId | null> {
  const abiertas = (await ConfiguracionPrematricula.find().sort({ desde: -1 })).filter((c) => ventanaAbierta(c, ahora));
  for (const ventana of abiertas) {
    const anio = await AcademicYear.findById(ventana.academic_year_id).select('estado');
    if (anio && anio.estado !== 'CERRADO') return anio._id;
  }
  return null;
}

/**
 * El año al que apunta una solicitud que llega ahora: el de una ventana de prematrícula abierta (el siguiente) o, si no hay ninguna, el año en curso. Sin
 * año en curso, el de planificación más reciente. null si el colegio aún no tiene años.
 */
export async function anioDeLaAdmision(ahora: Date = new Date()): Promise<Types.ObjectId | null> {
  const conVentana = await anioConVentanaAbierta(ahora);
  if (conVentana) return conVentana;
  const enCurso = await AcademicYear.findOne({ estado: 'EN_CURSO' }).select('_id');
  if (enCurso) return enCurso._id;
  const planificacion = await AcademicYear.findOne({ estado: 'PLANIFICACION' }).sort({ year: -1 }).select('_id');
  return planificacion?._id ?? null;
}

export interface FilaDeCuposConNombres extends Omit<FilaDeCupos, 'grade_id' | 'sede_id' | 'jornada_id'> {
  grado: { id: string; nombre: string; numero: number };
  sede: { id: string; nombre: string };
  jornada: { id: string; nombre: string };
}

export interface VistaDeCupos {
  anio: { id: string; year: number; estado: string };
  ventana: VistaVentana | null;
  filas: FilaDeCuposConNombres[];
  /** Reservas que pasaron el último día para matricular: ya no ocupan cupo. */
  reservas_vencidas: number;
}

/** Lee los datos y calcula los cupos del año. Con `session` lee dentro de una transacción (la reserva lo necesita para decidir con lo último). */
async function leerCupos(anioId: string | Types.ObjectId, ahora: Date, session?: ClientSession): Promise<{ filas: FilaDeCupos[]; vencidas: number; ventana: ConfiguracionPrematriculaDocument | null }> {
  const s = session ?? null;
  const [ventana, grupos, solicitudes, continuidades] = await Promise.all([
    ConfiguracionPrematricula.findOne({ academic_year_id: anioId }).session(s),
    Group.find({ academic_year_id: anioId, estado: { $ne: 'CLOSED' } }).select('grade_id sede_id jornada_id max_capacity cupos_ocupados').session(s),
    AdmissionRequest.find({ academic_year_id: anioId, estado: { $in: ['CUPO_RESERVADO', 'EN_ESPERA'] } }).select('estado grado_deseado_id reserva').session(s),
    ConfirmacionContinuidad.find({ academic_year_id: anioId, decision: 'CONTINUA', grade_id: { $ne: null }, jornada_id: { $ne: null } }).select('student_id grade_id sede_id jornada_id').session(s),
  ]);
  // Quien ya tiene su pre-matrícula en el año ya cuenta en `cupos_ocupados`: no se le aparta el cupo dos veces.
  const yaMatriculados = new Set(
    (await Enrollment.distinct('student_id', { academic_year_id: anioId, student_id: { $in: continuidades.map((c) => c.student_id) }, estado: { $in: ESTADOS_MATRICULA_VIVOS } }).session(s)).map(String)
  );
  const vigente = reservaVigente(ventana?.fecha_limite_matricula ?? null, ahora);
  const cubetaDe = (sol: { grado_deseado_id: Types.ObjectId; reserva: { sede_id: Types.ObjectId; jornada_id: Types.ObjectId } | null }) =>
    sol.reserva ? { grade_id: String(sol.grado_deseado_id), sede_id: String(sol.reserva.sede_id), jornada_id: String(sol.reserva.jornada_id) } : null;

  const reservadas = solicitudes.filter((x) => x.estado === 'CUPO_RESERVADO');
  const enEspera = solicitudes.filter((x) => x.estado === 'EN_ESPERA');
  const filas = calcularCupos(
    grupos.map((g) => ({ grade_id: String(g.grade_id), sede_id: String(g.sede_id), jornada_id: String(g.jornada_id), max_capacity: g.max_capacity, cupos_ocupados: g.cupos_ocupados })),
    vigente ? reservadas.map(cubetaDe).filter((c): c is NonNullable<typeof c> => c !== null) : [],
    enEspera.map(cubetaDe).filter((c): c is NonNullable<typeof c> => c !== null),
    vigente
      ? continuidades
          .filter((c) => !yaMatriculados.has(String(c.student_id)))
          .map((c) => ({ grade_id: String(c.grade_id), sede_id: String(c.sede_id), jornada_id: String(c.jornada_id) }))
      : []
  );
  return { filas, vencidas: vigente ? 0 : reservadas.length, ventana };
}

export async function cuposDelAnio(anioId: string, ahora: Date = new Date()): Promise<VistaDeCupos> {
  const anio = await AcademicYear.findById(anioId).select('year estado');
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  const { filas, vencidas, ventana } = await leerCupos(anioId, ahora);

  const [grados, sedes, jornadas] = await Promise.all([
    Grade.find({ _id: { $in: [...new Set(filas.map((f) => f.grade_id))] } }).select('nombre numero'),
    Campus.find({ _id: { $in: [...new Set(filas.map((f) => f.sede_id))] } }).select('nombre'),
    JornadaOperativa.find({ _id: { $in: [...new Set(filas.map((f) => f.jornada_id))] } }).select('nombre'),
  ]);
  const grado = new Map(grados.map((g) => [String(g._id), g]));
  const sede = new Map(sedes.map((c) => [String(c._id), c]));
  const jornada = new Map(jornadas.map((j) => [String(j._id), j]));

  const conNombres = filas.map(({ grade_id, sede_id, jornada_id, ...numeros }) => ({
    ...numeros,
    grado: { id: grade_id, nombre: grado.get(grade_id)?.nombre ?? '—', numero: grado.get(grade_id)?.numero ?? 0 },
    sede: { id: sede_id, nombre: sede.get(sede_id)?.nombre ?? '—' },
    jornada: { id: jornada_id, nombre: jornada.get(jornada_id)?.nombre ?? '—' },
  }));
  conNombres.sort((a, b) => a.grado.numero - b.grado.numero || a.sede.nombre.localeCompare(b.sede.nombre, 'es') || a.jornada.nombre.localeCompare(b.jornada.nombre, 'es'));
  return { anio: { id: String(anio._id), year: anio.year, estado: anio.estado }, ventana: ventana ? vistaDeVentana(ventana, ahora) : null, filas: conNombres, reservas_vencidas: vencidas };
}

export interface ResultadoReserva {
  solicitud: AdmissionRequestDocument;
  /** Dice por qué quedó en espera, si pasó; null si se reservó. */
  aviso: string | null;
  posicion_espera: number | null;
}

const enMismaCubeta = (sol: AdmissionRequestDocument, sede: string, jornada: string) => ({
  academic_year_id: sol.academic_year_id,
  grado_deseado_id: sol.grado_deseado_id,
  'reserva.sede_id': new Types.ObjectId(sede),
  'reserva.jornada_id': new Types.ObjectId(jornada),
});

/**
 * Reserva cupo a una solicitud en un grado, sede y jornada: si hay cupo libre y nadie que se inscribió antes espera en esa cubeta pasa a CUPO_RESERVADO;
 * si no, queda EN_ESPERA (y se avisa por qué). No crea grupo, cuenta ni matrícula. La decisión se toma dentro de una transacción serializada por cubeta:
 * dos reservas a la vez no pueden pasarse del cupo.
 */
export async function reservarCupo(solicitudId: string, destino: { sede_id: string; jornada_id: string }, usuario: { id: Types.ObjectId | string }, ahora: Date = new Date()): Promise<ResultadoReserva> {
  const resultado = await runTransaction(async (session): Promise<ResultadoReserva> => {
    const solicitud = await AdmissionRequest.findById(solicitudId).session(session);
    if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada.');
    if (!ESTADOS_QUE_PUEDEN_RESERVAR.includes(solicitud.estado)) {
      throw new ApiError(409, solicitud.estado === 'CUPO_RESERVADO' ? 'Esta solicitud ya tiene el cupo reservado.' : `Una solicitud ${solicitud.estado.toLowerCase()} no recibe reserva de cupo.`);
    }
    const anioId = solicitud.academic_year_id ?? (await anioDeLaAdmision(ahora));
    if (!anioId) throw new ApiError(409, 'Aún no hay un año lectivo al que reservar cupo: créalo en «Año lectivo».');
    const anio = await AcademicYear.findById(anioId).select('year estado').session(session);
    if (!anio || anio.estado === 'CERRADO') throw new ApiError(409, 'El año de esa solicitud ya está cerrado.');

    const jornada = await JornadaOperativa.findById(destino.jornada_id).select('sede_id').session(session);
    if (!jornada || String(jornada.sede_id) !== destino.sede_id) throw new ApiError(400, 'Esa jornada no es de la sede elegida.');

    const cubeta = { grade_id: String(solicitud.grado_deseado_id), sede_id: destino.sede_id, jornada_id: destino.jornada_id };
    // Escribir un documento compartido por cubeta serializa a quienes reservan a la vez: el reintento ve lo que dejó la otra.
    await Counter.findOneAndUpdate({ _id: `PREMATRICULA-${anioId}-${claveDeCubeta(cubeta)}` }, { $inc: { seq: 1 } }, { upsert: true, session });

    const { filas } = await leerCupos(anioId, ahora, session);
    const fila = filas.find((f) => claveDeCubeta(f) === claveDeCubeta(cubeta));
    if (!fila) throw new ApiError(409, `El año ${anio.year} no tiene grupos de ese grado en esa sede y jornada: créalos en «Grupos» antes de reservar.`);

    const esperandoAntes = await AdmissionRequest.countDocuments({
      ...enMismaCubeta(solicitud, destino.sede_id, destino.jornada_id),
      academic_year_id: anioId,
      estado: 'EN_ESPERA',
      _id: { $ne: solicitud._id },
      createdAt: { $lt: solicitud.createdAt },
    }).session(session);
    const decision = decidirReserva(fila.libres, esperandoAntes);
    // Quien ya espera y todavía no le toca no cambia de estado: solo se le explica.
    if (decision.accion === 'ESPERAR' && solicitud.estado === 'EN_ESPERA') throw new ApiError(409, decision.motivo);

    solicitud.academic_year_id = anioId;
    solicitud.estado = decision.accion === 'RESERVAR' ? 'CUPO_RESERVADO' : 'EN_ESPERA';
    solicitud.reserva = { sede_id: new Types.ObjectId(destino.sede_id), jornada_id: new Types.ObjectId(destino.jornada_id), reservado_por: new Types.ObjectId(usuario.id), fecha: ahora };
    await solicitud.save({ session });

    let posicion: number | null = null;
    if (solicitud.estado === 'EN_ESPERA') {
      posicion =
        1 +
        (await AdmissionRequest.countDocuments({ ...enMismaCubeta(solicitud, destino.sede_id, destino.jornada_id), estado: 'EN_ESPERA', _id: { $ne: solicitud._id }, createdAt: { $lt: solicitud.createdAt } }).session(session));
    }
    return { solicitud, aviso: decision.accion === 'ESPERAR' ? decision.motivo : null, posicion_espera: posicion };
  });

  await registrarEvento({
    usuario_id: usuario.id,
    accion: resultado.solicitud.estado === 'CUPO_RESERVADO' ? 'CUPO_RESERVADO' : 'SOLICITUD_EN_ESPERA',
    entidad: 'AdmissionRequest',
    entidad_id: resultado.solicitud._id,
    detalle: resultado.solicitud.estado === 'CUPO_RESERVADO' ? 'Cupo reservado' : `En lista de espera (posición ${resultado.posicion_espera})`,
  });
  return resultado;
}

export interface ReservaPublica {
  grado: string;
  sede: string;
  jornada: string;
  anio: number | null;
  fecha_limite_matricula: Date | null;
  /** Pasó el último día para matricular: el cupo ya no está apartado. */
  vencida: boolean;
}

/** Lo que la familia ve de su cupo reservado o de su espera, en la consulta pública. Nunca trae datos de otras solicitudes. */
export async function infoPublicaDeReserva(solicitud: AdmissionRequestDocument, ahora: Date = new Date()): Promise<{ reserva: ReservaPublica | null; posicion_espera: number | null }> {
  if (!['CUPO_RESERVADO', 'EN_ESPERA'].includes(solicitud.estado) || !solicitud.reserva) return { reserva: null, posicion_espera: null };
  const [grado, sede, jornada, anio, ventana] = await Promise.all([
    Grade.findById(solicitud.grado_deseado_id).select('nombre'),
    Campus.findById(solicitud.reserva.sede_id).select('nombre'),
    JornadaOperativa.findById(solicitud.reserva.jornada_id).select('nombre'),
    solicitud.academic_year_id ? AcademicYear.findById(solicitud.academic_year_id).select('year') : null,
    solicitud.academic_year_id ? ConfiguracionPrematricula.findOne({ academic_year_id: solicitud.academic_year_id }) : null,
  ]);
  const limite = ventana?.fecha_limite_matricula ?? null;
  const posicion =
    solicitud.estado === 'EN_ESPERA'
      ? 1 + (await AdmissionRequest.countDocuments({ ...enMismaCubeta(solicitud, String(solicitud.reserva.sede_id), String(solicitud.reserva.jornada_id)), estado: 'EN_ESPERA', _id: { $ne: solicitud._id }, createdAt: { $lt: solicitud.createdAt } }))
      : null;
  return {
    reserva: {
      grado: grado?.nombre ?? '—',
      sede: sede?.nombre ?? '—',
      jornada: jornada?.nombre ?? '—',
      anio: anio?.year ?? null,
      fecha_limite_matricula: limite,
      vencida: solicitud.estado === 'CUPO_RESERVADO' && !reservaVigente(limite, ahora),
    },
    posicion_espera: posicion,
  };
}
