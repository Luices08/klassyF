import AcademicYear from '../models/academicYear.model';
import catchAsync from '../utils/catchAsync';

interface ListAcademicYearsQuery {
  institucion_id?: string;
}

// Listado de solo lectura: la creacion de años lectivos vive en
// institution.service.ts (M01/M05), esto solo expone el catalogo para que
// otros modulos (M06) puedan seleccionar un academic_year_id.
export const listAcademicYears = catchAsync<unknown, unknown, unknown, ListAcademicYearsQuery>(async (req, res) => {
  const filter: Record<string, string> = {};
  if (req.query.institucion_id) filter.institucion_id = req.query.institucion_id;

  const academicYears = await AcademicYear.find(filter).sort({ year: -1 });
  res.status(200).json({ success: true, count: academicYears.length, data: academicYears });
});
