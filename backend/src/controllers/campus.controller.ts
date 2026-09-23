import * as campusService from '../services/campus.service';
import { CrearSedeInput } from '../services/campus.service';
import Campus from '../models/campus.model';
import catchAsync from '../utils/catchAsync';

interface ListCampusesQuery {
  institucion_id?: string;
}

export const listCampuses = catchAsync<unknown, unknown, unknown, ListCampusesQuery>(async (req, res) => {
  const filter: Record<string, string> = {};
  if (req.query.institucion_id) filter.institucion_id = req.query.institucion_id;

  const campuses = await Campus.find(filter).sort({ nombre: 1 });
  res.status(200).json({ success: true, count: campuses.length, data: campuses });
});

export const crearSede = catchAsync<unknown, unknown, CrearSedeInput>(async (req, res) => {
  const sede = await campusService.crearSede(req.body);
  res.status(201).json({ success: true, data: sede });
});
