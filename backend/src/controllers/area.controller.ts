import { EstadoArea } from '../constants/enums';
import Area from '../models/area.model';
import catchAsync from '../utils/catchAsync';

interface CreateAreaBody {
  institucion_id: string;
  nombre: string;
  codigo: string;
  estado?: EstadoArea;
}

export const createArea = catchAsync<unknown, unknown, CreateAreaBody>(async (req, res) => {
  const area = await Area.create(req.body);
  res.status(201).json({ success: true, data: area });
});

interface ListAreasQuery {
  institucion_id?: string;
  estado?: EstadoArea;
}

export const listAreas = catchAsync<unknown, unknown, unknown, ListAreasQuery>(async (req, res) => {
  const filter: Record<string, string> = {};
  if (req.query.institucion_id) filter.institucion_id = req.query.institucion_id;
  if (req.query.estado) filter.estado = req.query.estado;

  const areas = await Area.find(filter).sort({ nombre: 1 });
  res.status(200).json({ success: true, count: areas.length, data: areas });
});
