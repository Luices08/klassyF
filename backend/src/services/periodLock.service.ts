import { Types } from 'mongoose';
import { ESTADOS_PERIODO_CALIFICABLES } from '../constants/anioLectivo';
import { EstadoPeriodo } from '../constants/enums';
import AcademicYear from '../models/academicYear.model';
import Group from '../models/group.model';
import PeriodLock, { PeriodLockDocument } from '../models/periodLock.model';
import ApiError from '../utils/ApiError';
import { periodosEfectivos, ventanaNotas } from '../utils/calendarioAcademico';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { registrarEvento } from './audit.service';
import { existeProrrogaVigente } from './periodoProrroga.service';

export interface SetPeriodLockInput {
  academic_year_id: string;
  periodo_numero: number;
  group_id: string;
  estado: EstadoPeriodo;
}

export interface ContextoActor {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

/**
 * Abre o cierra formalmente un periodo para un grupo especifico. Upsert: si no
 * existia PeriodLock para esa combinacion, se crea; si existia, se actualiza.
 */
export async function setPeriodLock(
  input: SetPeriodLockInput,
  { usuarioId, ip }: ContextoActor
): Promise<PeriodLockDocument> {
  const academicYear = await AcademicYear.findById(input.academic_year_id);
  if (!academicYear) throw new ApiError(404, 'Año lectivo no encontrado.');
  // Un año CERRADO es historico de solo lectura, igual que en el resto de M05.
  await asegurarAnioNoCerrado(input.academic_year_id);

  const periodo = academicYear.periodos.find((p) => p.numero === input.periodo_numero);
  if (!periodo) throw new ApiError(400, `El año lectivo ${academicYear.year} no tiene periodo ${input.periodo_numero}.`);

  const group = await Group.findById(input.group_id);
  if (!group) throw new ApiError(404, 'Grupo no encontrado.');
  if (String(group.academic_year_id) !== String(input.academic_year_id)) {
    throw new ApiError(400, 'El grupo no pertenece al año lectivo indicado.');
  }

  const lock = await PeriodLock.findOneAndUpdate(
    {
      academic_year_id: input.academic_year_id,
      periodo_numero: input.periodo_numero,
      group_id: input.group_id,
    },
    { $set: { estado: input.estado } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'BLOQUEO_PERIODO_GRUPO_ACTUALIZADO',
    entidad: 'PeriodLock',
    entidad_id: lock._id,
    detalle: `Año ${academicYear.year}, periodo ${input.periodo_numero}, grupo ${group.nomenclatura}: ${input.estado}`,
    ip,
  });

  return lock;
}

const formatoFecha = (fecha: Date): string => fecha.toISOString().slice(0, 10);

/**
 * Bloqueo extemporaneo: toda mutacion de nota debe pasar por aqui. Exige (M05)
 * que el año lectivo este vigente y que el periodo admita notas: estado ABIERTO o
 * EN_DIGITACION y, si tiene ventana de calificacion (la de la sede del grupo,
 * si esta tiene calendario propio), dentro de ella. Una prorroga vigente
 * habilita a su docente/grupo aunque el periodo ya no admita notas.
 *
 * Ademas, la ausencia de un PeriodLock para la combinacion (año, grupo,
 * periodo) se interpreta como ABIERTO por defecto (no es necesario pre-crear
 * un registro para cada grupo).
 */
export async function assertPeriodNotLocked(
  academicYearId: Types.ObjectId | string,
  groupId: Types.ObjectId | string,
  periodoNumero: number,
  docenteId: Types.ObjectId | string | null = null
): Promise<void> {
  const [anio, grupo] = await Promise.all([AcademicYear.findById(academicYearId), Group.findById(groupId)]);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (!grupo) throw new ApiError(404, 'Grupo no encontrado.');

  if (anio.estado !== 'EN_CURSO') {
    throw new ApiError(409, `El año lectivo ${anio.year} no está vigente; no se pueden modificar notas.`);
  }

  const periodo = anio.periodos.find((p) => p.numero === periodoNumero);
  if (!periodo) throw new ApiError(400, `El año lectivo ${anio.year} no tiene periodo ${periodoNumero}.`);

  const calendarioSede = anio.calendarios_sede.find((c) => String(c.sede_id) === String(grupo.sede_id));
  const efectivo = periodosEfectivos(anio.periodos, calendarioSede).find((p) => p.numero === periodoNumero);
  const ventana = efectivo ?? periodo;
  const { apertura, cierre } = ventanaNotas(ventana);
  const ahora = new Date();

  let motivoBloqueo: string | null = null;
  if (!ESTADOS_PERIODO_CALIFICABLES.includes(periodo.estado)) {
    motivoBloqueo =
      periodo.estado === 'PROGRAMADO'
        ? `El periodo ${periodoNumero} aún no está abierto para calificar.`
        : `El periodo ${periodoNumero} está CERRADO; las planillas están bloqueadas.`;
  } else if (apertura && ventana.fecha_apertura_notas && ahora < apertura) {
    motivoBloqueo = `La digitación de notas del periodo ${periodoNumero} abre el ${formatoFecha(ventana.fecha_apertura_notas)}.`;
  } else if (cierre && ventana.fecha_cierre_notas && ahora > cierre) {
    motivoBloqueo = `La ventana de digitación de notas del periodo ${periodoNumero} cerró el ${formatoFecha(ventana.fecha_cierre_notas)}.`;
  }

  if (motivoBloqueo && !(await existeProrrogaVigente(anio._id, periodoNumero, groupId, docenteId))) {
    throw new ApiError(409, `${motivoBloqueo} Solicita una prórroga al coordinador si necesitas registrar notas.`);
  }

  const lock = await PeriodLock.findOne({
    academic_year_id: academicYearId,
    group_id: groupId,
    periodo_numero: periodoNumero,
  });

  if (lock && lock.estado === 'CERRADO') {
    throw new ApiError(
      409,
      `El periodo ${periodoNumero} para este grupo se encuentra CERRADO; no se pueden modificar notas.`
    );
  }
}
