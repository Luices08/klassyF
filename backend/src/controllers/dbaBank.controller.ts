import DBABank from '../models/dbaBank.model';
import catchAsync from '../utils/catchAsync';

interface DbaItemBody {
  grade_id: string;
  area_id: string;
  numero_dba: number;
  enunciado: string;
  evidencias_aprendizaje?: string[];
  eje_tematico: string;
}

// Carga/seed: el body puede ser un solo objeto DBA o un array para carga masiva.
export const createDbaEntries = catchAsync<unknown, unknown, DbaItemBody | DbaItemBody[]>(async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const created = await DBABank.insertMany(items, { ordered: true });
  res.status(201).json({ success: true, count: created.length, data: created });
});

interface ListDbaQuery {
  grade_id?: string;
  area_id?: string;
}

export const listDbaEntries = catchAsync<unknown, unknown, unknown, ListDbaQuery>(async (req, res) => {
  const filter: Record<string, string> = {};
  if (req.query.grade_id) filter.grade_id = req.query.grade_id;
  if (req.query.area_id) filter.area_id = req.query.area_id;

  const entries = await DBABank.find(filter).sort({ numero_dba: 1 });
  res.status(200).json({ success: true, count: entries.length, data: entries });
});
