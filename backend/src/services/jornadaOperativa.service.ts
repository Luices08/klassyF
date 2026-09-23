import { Types } from 'mongoose';
import Campus from '../models/campus.model';
import JornadaOperativa, { JornadaOperativaDocument } from '../models/jornadaOperativa.model';
import { Jornada } from '../constants/enums';
import ApiError from '../utils/ApiError';

export interface CrearJornadaInput {
  sede_id: string | Types.ObjectId;
  nombre: Jornada;
}

// Habilita una jornada (MANANA/TARDE/UNICA/NOCTURNA) para una sede existente.
// La jornada pertenece a la sede (no a la institucion), por eso se valida que
// la sede exista antes de crearla.
export async function crearJornada(input: CrearJornadaInput): Promise<JornadaOperativaDocument> {
  const sede = await Campus.findById(input.sede_id);
  if (!sede) throw new ApiError(404, 'sede_id no corresponde a una sede existente.');

  return JornadaOperativa.create(input);
}
