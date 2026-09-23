import { Types } from 'mongoose';
import Campus, { CampusDocument } from '../models/campus.model';
import Institution from '../models/institution.model';
import ApiError from '../utils/ApiError';

export interface CrearSedeInput {
  institucion_id: string | Types.ObjectId;
  nombre: string;
  codigo_dane_sede: string;
  direccion: string;
}

// Crea una sede adicional (no principal) para una institucion ya existente.
// La sede principal solo se crea una vez, dentro de institution.service#setupInstitution.
export async function crearSede(input: CrearSedeInput): Promise<CampusDocument> {
  const institucion = await Institution.findById(input.institucion_id);
  if (!institucion) throw new ApiError(404, 'institucion_id no corresponde a una institucion existente.');

  return Campus.create({ ...input, es_principal: false });
}
