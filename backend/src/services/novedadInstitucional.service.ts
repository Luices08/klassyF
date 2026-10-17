import { Types } from 'mongoose';
import Institution from '../models/institution.model';
import Observacion from '../models/observacion.model';
import TipoObservacion, { TipoObservacionDocument } from '../models/tipoObservacion.model';

export const NOMBRE_TIPO_NOVEDAD = 'Novedad institucional';

/** El tipo con que el sistema asienta sus novedades en el Observador; se crea la primera vez que hace falta y nadie lo edita. */
async function tipoDeNovedad(): Promise<TipoObservacionDocument> {
  const institucion = await Institution.findOne().select('_id');
  if (!institucion) throw new Error('No hay institución para asentar la novedad.');
  const existente = await TipoObservacion.findOne({ institucion_id: institucion._id, sistema: true });
  if (existente) return existente;
  try {
    return await TipoObservacion.create({ institucion_id: institucion._id, nombre: NOMBRE_TIPO_NOVEDAD, visible_estudiante: true, orden: 99, sistema: true });
  } catch (err) {
    // Dos peticiones a la vez, o el colegio ya tenía un tipo con ese nombre: se reutiliza el que quedó.
    const otro = await TipoObservacion.findOne({ institucion_id: institucion._id, $or: [{ sistema: true }, { nombre: NOMBRE_TIPO_NOVEDAD }] });
    if (!otro) throw err;
    if (!otro.sistema) {
      otro.sistema = true;
      otro.visible_estudiante = true;
      otro.estado = 'activo';
      await otro.save();
    }
    return otro;
  }
}

export interface DatosNovedad {
  student_id: Types.ObjectId;
  enrollment_id: Types.ObjectId;
  group_id: Types.ObjectId;
  sede_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  periodo_numero: number | null;
  texto: string;
  por: Types.ObjectId;
}

/**
 * Asienta una novedad institucional en el Observador del estudiante (soporte legal: p. ej. «Promovido anticipadamente de X a Y según
 * Resolución No. Z»). La escribe el sistema, es visible para el estudiante y su familia, no es confidencial y no se enmienda ni se anula.
 * Idempotente por texto: repetirla no la duplica.
 */
export async function asentarNovedadEnObservador(d: DatosNovedad): Promise<void> {
  if (await Observacion.exists({ student_id: d.student_id, de_sistema: true, descripcion: d.texto })) return;
  const tipo = await tipoDeNovedad();
  await Observacion.create({
    student_id: d.student_id,
    enrollment_id: d.enrollment_id,
    group_id: d.group_id,
    sede_id: d.sede_id,
    academic_year_id: d.academic_year_id,
    periodo_numero: d.periodo_numero,
    fecha_hecho: new Date(),
    clase: 'OBSERVACION',
    descripcion: d.texto,
    tipo_id: tipo._id,
    tipo_nombre: tipo.nombre,
    visible_estudiante: true,
    confidencial: false,
    de_sistema: true,
    registrado_por: d.por,
    autor_id: d.por,
    contexto: 'COORDINACION',
  });
}
