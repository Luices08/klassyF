import { ParsedQs } from 'qs';
import * as reportCardService from '../services/reportCard.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface ReportCardQuery extends ParsedQs {
  student_id: string;
  academic_year_id: string;
  // Joi ya valida y convierte esto a numero (convert:true por defecto); se
  // tipa como string aqui porque el indice de ParsedQs no admite `number`.
  periodo: string;
}

export const getReportCard = catchAsync<unknown, unknown, unknown, ReportCardQuery>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const reportCard = await reportCardService.generateReportCard(
    {
      student_id: req.query.student_id,
      academic_year_id: req.query.academic_year_id,
      periodo_numero: Number(req.query.periodo),
    },
    req.user
  );

  res.status(200).json({ success: true, data: reportCard });
});
