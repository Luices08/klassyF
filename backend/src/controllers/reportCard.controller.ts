import { ParsedQs } from 'qs';
import * as reportCardService from '../services/reportCard.service';
import * as reportCardPdfService from '../services/reportCardPdf.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface ReportCardQuery extends ParsedQs {
  student_id: string;
  academic_year_id: string;
  // Joi ya valida y convierte esto a numero (convert:true por defecto); se
  // tipa como string aqui porque el indice de ParsedQs no admite `number`.
  periodo: string;
}

interface BoletinesGrupoQuery extends ParsedQs {
  group_id: string;
  academic_year_id: string;
  periodo: string;
}

const consultaDeBoletin = (query: ReportCardQuery) => ({
  student_id: query.student_id,
  academic_year_id: query.academic_year_id,
  periodo_numero: Number(query.periodo),
});

export const getReportCard = catchAsync<unknown, unknown, unknown, ReportCardQuery>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const reportCard = await reportCardService.generateReportCard(consultaDeBoletin(req.query), req.user);

  res.status(200).json({ success: true, data: reportCard });
});

export const descargarPdfBoletin = catchAsync<unknown, unknown, unknown, ReportCardQuery>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const { buffer, nombreArchivo } = await reportCardPdfService.generarPdfBoletin(consultaDeBoletin(req.query), req.user);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const descargarPdfBoletinesDeGrupo = catchAsync<unknown, unknown, unknown, BoletinesGrupoQuery>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const { buffer, nombreArchivo } = await reportCardPdfService.generarPdfBoletinesDeGrupo(
    { group_id: req.query.group_id, academic_year_id: req.query.academic_year_id, periodo_numero: Number(req.query.periodo) },
    req.user,
    req.ip
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
});
