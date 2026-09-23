import Subject from '../models/subject.model';
import catchAsync from '../utils/catchAsync';

interface CreateSubjectBody {
  area_id: string;
  nombre: string;
  intensidad_horaria_semanal: number;
}

export const createSubject = catchAsync<unknown, unknown, CreateSubjectBody>(async (req, res) => {
  const subject = await Subject.create(req.body);
  res.status(201).json({ success: true, data: subject });
});

interface ListSubjectsQuery {
  area_id?: string;
}

export const listSubjects = catchAsync<unknown, unknown, unknown, ListSubjectsQuery>(async (req, res) => {
  const filter: Record<string, string> = {};
  if (req.query.area_id) filter.area_id = req.query.area_id;

  const subjects = await Subject.find(filter).sort({ nombre: 1 });
  res.status(200).json({ success: true, count: subjects.length, data: subjects });
});
