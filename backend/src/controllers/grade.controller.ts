import Grade from '../models/grade.model';
import catchAsync from '../utils/catchAsync';

// Catalogo pequeño y global (Transicion a Once, ver scripts/seed.ts); no necesita filtros.
export const listGrades = catchAsync(async (_req, res) => {
  const grades = await Grade.find().sort({ numero: 1 });
  res.status(200).json({ success: true, count: grades.length, data: grades });
});
