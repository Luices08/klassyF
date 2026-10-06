import { Types } from 'mongoose';
import Campus from '../models/campus.model';
import JornadaOperativa, { JornadaOperativaDocument } from '../models/jornadaOperativa.model';
import { Jornada } from '../constants/enums';
import ApiError from '../utils/ApiError';
import { Franja, generarFranjas } from '../utils/franjas';
import { registrarEvento } from './audit.service';
import { buscarInstitucion } from './institution.service';

export interface CrearJornadaInput {
  sede_id: string | Types.ObjectId;
  nombre: Jornada;
  hora_inicio: string;
  hora_fin: string;
}

interface ContextoUsuario {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

export interface ActualizarHorarioInput {
  dias_habiles: number[];
  franjas: Franja[];
}

/**
 * Define la estructura de tiempo de una jornada: los dias en que opera y sus franjas de clase/descanso. Es la fuente
 * unica que leen la malla de ocupacion de espacios (M10) y el motor de horarios (M09). El modelo valida que las
 * franjas queden dentro de la jornada, en orden y sin traslapes.
 */
export async function actualizarHorario(
  id: string,
  input: ActualizarHorarioInput,
  { usuarioId, ip }: ContextoUsuario
): Promise<JornadaOperativaDocument> {
  const jornada = await JornadaOperativa.findById(id);
  if (!jornada) throw new ApiError(404, 'La jornada indicada no existe.');

  jornada.set({ dias_habiles: [...input.dias_habiles].sort((a, b) => a - b), franjas: input.franjas });
  await jornada.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'JORNADA_HORARIO_ACTUALIZADO',
    entidad: 'JornadaOperativa',
    entidad_id: jornada._id,
    detalle: `${jornada.nombre}: ${jornada.dias_habiles.length} dia(s), ${jornada.franjas.length} franja(s)`,
    ip,
  });
  return jornada;
}

/** Franjas que resultarian de aplicar la plantilla institucional a la jornada (no guarda nada: el usuario las revisa). */
export async function franjasDesdePlantilla(id: string) {
  const jornada = await JornadaOperativa.findById(id);
  if (!jornada) throw new ApiError(404, 'La jornada indicada no existe.');

  const institucion = await buscarInstitucion({ campos: 'plantilla_franjas' });
  return generarFranjas(institucion?.plantilla_franjas ?? [], jornada);
}

// Habilita una jornada (MANANA/TARDE/UNICA/NOCTURNA) para una sede existente.
// La jornada pertenece a la sede (no a la institucion), por eso se valida que
// la sede exista antes de crearla.
export async function crearJornada(input: CrearJornadaInput): Promise<JornadaOperativaDocument> {
  const sede = await Campus.findById(input.sede_id);
  if (!sede) throw new ApiError(404, 'sede_id no corresponde a una sede existente.');

  return JornadaOperativa.create(input);
}
