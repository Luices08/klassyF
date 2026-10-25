import fs from 'fs/promises';
import { Types } from 'mongoose';
import AcademicYear from '../models/academicYear.model';
import Activity from '../models/activity.model';
import ActivitySubmission, { IArchivoEntrega, IIntentoEntrega } from '../models/activitySubmission.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import ApiError from '../utils/ApiError';
import { intentoConsiderado } from '../utils/entregasActividad';
import { archivoDisponible, cumpleAntiguedad, megabytes, rutaDentroDe } from '../utils/purgaAlmacenamiento';
import { ACTIVIDADES_DIR } from '../utils/uploadPaths';
import { archivosDe, intentosDe } from './actividadEntrega.service';
import { registrarEvento } from './audit.service';

const MAX_ERRORES_EN_RESUMEN = 50;

export interface ResumenPurga {
  periodo: { anio: number; numero: number; nombre: string };
  simulacion: boolean;
  dias: number;
  entregas_afectadas: number;
  archivos_borrados: number;
  bytes_liberados: number;
  mb_liberados: number;
  /** El archivo ya no estaba en disco (se borró por fuera): igual se marca como depurado. */
  archivos_ya_ausentes: number;
  /** Aún no cumplen los días de espera. */
  archivos_recientes: number;
  errores: string[];
}

export type ResultadoBorrado = { tipo: 'borrado'; bytes: number } | { tipo: 'ausente' } | { tipo: 'error'; motivo: string };

/**
 * Borra el archivo físico. Primero el disco y después la base: si el proceso se cae entre los dos pasos la base sigue apuntando
 * a un archivo que ya no está (y volver a correr lo marca), nunca queda un archivo huérfano que nadie pueda encontrar.
 */
async function borrarArchivoFisico(rutaGuardada: string, simular: boolean): Promise<ResultadoBorrado> {
  const ruta = rutaDentroDe(ACTIVIDADES_DIR, rutaGuardada);
  if (!ruta) return { tipo: 'error', motivo: 'la ruta guardada queda fuera de la carpeta de actividades; no se tocó' };
  try {
    const { size } = await fs.stat(ruta);
    if (!simular) await fs.unlink(ruta);
    return { tipo: 'borrado', bytes: size };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { tipo: 'ausente' };
    return { tipo: 'error', motivo: (err as Error).message };
  }
}

export interface ResultadoDepuracionIntentos {
  intentos: IIntentoEntrega[];
  /** Archivos que cambiaron a depurados (borrados o ya ausentes). */
  cambios: number;
  borrados: number;
  bytes: number;
  ausentes: number;
  recientes: number;
  errores: string[];
}

/**
 * Pasa a depurados los archivos de los intentos de UNA entrega que ya cumplen la antigüedad. Solo toca los datos del archivo:
 * nada de la nota ni de las fechas. `borrar` quita el archivo físico (en simulación no borra, solo mide).
 */
export async function depurarIntentos(
  intentos: readonly IIntentoEntrega[],
  { finPeriodo, ahora, dias, borrar }: { finPeriodo: Date; ahora: Date; dias: number; borrar: (rutaGuardada: string) => Promise<ResultadoBorrado> }
): Promise<ResultadoDepuracionIntentos> {
  const r: ResultadoDepuracionIntentos = { intentos: [], cambios: 0, borrados: 0, bytes: 0, ausentes: 0, recientes: 0, errores: [] };

  for (const intento of intentos) {
    const archivosNuevos: IArchivoEntrega[] = [];
    let cambiosEnIntento = 0;

    for (const archivo of archivosDe(intento)) {
      if (!archivoDisponible(archivo)) {
        archivosNuevos.push(archivo);
        continue;
      }
      if (!cumpleAntiguedad(finPeriodo, intento.fecha_entrega, ahora, dias)) {
        r.recientes += 1;
        archivosNuevos.push(archivo);
        continue;
      }
      const resultado = await borrar(archivo.path as string);
      if (resultado.tipo === 'error') {
        r.errores.push(resultado.motivo);
        archivosNuevos.push(archivo);
        continue;
      }
      if (resultado.tipo === 'borrado') {
        r.borrados += 1;
        r.bytes += resultado.bytes;
      } else {
        r.ausentes += 1;
      }
      cambiosEnIntento += 1;
      archivosNuevos.push({ ...archivo, path: null, purgado: true, fecha_purga: ahora });
    }

    if (cambiosEnIntento === 0) {
      r.intentos.push(intento);
      continue;
    }
    r.cambios += cambiosEnIntento;
    // Los campos `archivo_*` del intento repiten su primer archivo: ahora el primero que siga en disco, o ninguno.
    const primero = archivosNuevos.find(archivoDisponible);
    r.intentos.push({
      ...intento,
      archivos: archivosNuevos,
      archivo_path: primero?.path ?? null,
      ...(primero ? { archivo_nombre: primero.nombre, archivo_formato: primero.formato, archivo_bytes: primero.bytes } : {}),
    });
  }
  return r;
}

/**
 * Depura los archivos de las entregas de un periodo CERRADO: borra el archivo físico y deja en la base `purgado: true`,
 * `fecha_purga` y `path: null`. Es la única escritura: la nota, la retroalimentación, el estado y las fechas de la entrega no se
 * tocan ni se actualiza `updatedAt`. Idempotente: lo ya depurado se omite, y los archivos que fallan se reintentan en la
 * siguiente corrida.
 *
 * @param periodoId `_id` del periodo dentro del año lectivo (`AcademicYear.periodos[]._id`).
 * @param dias días de espera tras el fin del periodo (o tras la entrega, si fue posterior) antes de depurar.
 */
export async function depurarArchivosDePeriodo(
  periodoId: string,
  { dias, simular = false, ahora = new Date() }: { dias: number; simular?: boolean; ahora?: Date }
): Promise<ResumenPurga> {
  if (!Types.ObjectId.isValid(periodoId)) throw new ApiError(400, 'El identificador del periodo no es válido.');
  const anio = await AcademicYear.findOne({ 'periodos._id': periodoId });
  const periodo = anio?.periodos.find((p) => String(p._id) === periodoId);
  if (!anio || !periodo) throw new ApiError(404, 'No existe un periodo con ese identificador.');
  if (periodo.estado !== 'CERRADO') {
    throw new ApiError(409, `El periodo ${periodo.numero} del año ${anio.year} está ${periodo.estado}: solo se depuran los periodos CERRADOS.`);
  }

  const resumen: ResumenPurga = {
    periodo: { anio: anio.year, numero: periodo.numero, nombre: periodo.nombre },
    simulacion: simular,
    dias,
    entregas_afectadas: 0,
    archivos_borrados: 0,
    bytes_liberados: 0,
    mb_liberados: 0,
    archivos_ya_ausentes: 0,
    archivos_recientes: 0,
    errores: [],
  };
  const registrarError = (mensaje: string) => {
    if (resumen.errores.length < MAX_ERRORES_EN_RESUMEN) resumen.errores.push(mensaje);
  };

  const asignaciones = await TeacherAssignment.find({ academic_year_id: anio._id }).select('_id').lean();
  const actividades = await Activity.find({
    teacher_assignment_id: { $in: asignaciones.map((a) => a._id) },
    periodo_numero: periodo.numero,
  })
    .select('_id')
    .lean();
  if (actividades.length === 0) return resumen;

  // Solo entregas que aún guardan algún archivo; lo que no cumpla se descarta en memoria con la regla exacta.
  const entregas = ActivitySubmission.find({
    activity_id: { $in: actividades.map((a) => a._id) },
    $or: [{ archivo_path: { $nin: [null, ''] } }, { 'intentos.archivo_path': { $nin: [null, ''] } }, { 'intentos.archivos.0': { $exists: true } }],
  }).cursor();

  for await (const entrega of entregas) {
    const plana = entrega.toObject() as unknown as Parameters<typeof intentosDe>[0];
    const r = await depurarIntentos(intentosDe(plana), {
      finPeriodo: periodo.fecha_fin,
      ahora,
      dias,
      borrar: (ruta) => borrarArchivoFisico(ruta, simular),
    });
    resumen.archivos_borrados += r.borrados;
    resumen.bytes_liberados += r.bytes;
    resumen.archivos_ya_ausentes += r.ausentes;
    resumen.archivos_recientes += r.recientes;
    r.errores.forEach((motivo) => registrarError(`Entrega ${String(entrega._id)}: ${motivo}`));
    const intentosNuevos = r.intentos;
    const cambios = r.cambios;

    if (cambios === 0) continue;
    resumen.entregas_afectadas += 1;
    if (simular) continue;

    try {
      // Los campos de arriba de la entrega reflejan el intento que cuenta.
      const considerado = intentoConsiderado(intentosNuevos, entrega.intento_valido);
      entrega.set('intentos', intentosNuevos);
      if (considerado) {
        entrega.archivo_path = considerado.archivo_path;
        if (considerado.archivo_path) {
          entrega.archivo_nombre = considerado.archivo_nombre;
          entrega.archivo_formato = considerado.archivo_formato;
          entrega.archivo_bytes = considerado.archivo_bytes;
        }
      }
      // `timestamps: false`: depurar un archivo no es una modificación académica de la entrega.
      await entrega.save({ timestamps: false });
    } catch (err) {
      registrarError(`Entrega ${String(entrega._id)}: los archivos se borraron pero la base no se actualizó (${(err as Error).message}); vuelve a correr la depuración.`);
    }
  }

  resumen.mb_liberados = megabytes(resumen.bytes_liberados);

  if (!simular && (resumen.archivos_borrados > 0 || resumen.archivos_ya_ausentes > 0)) {
    await registrarEvento({
      accion: 'ALMACENAMIENTO_ARCHIVOS_DEPURADOS',
      entidad: 'AcademicYear',
      entidad_id: anio._id,
      detalle: `Año ${anio.year}, periodo ${periodo.numero}: ${resumen.archivos_borrados} archivos de entregas depurados (${resumen.mb_liberados} MB) tras ${dias} días; ${resumen.entregas_afectadas} entregas.`,
    });
  }
  return resumen;
}
