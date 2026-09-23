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
