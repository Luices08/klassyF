import { ParsedQs } from 'qs';
import * as libros from '../services/libroCalificaciones.service';
import { reporteBalanceInclusion } from '../services/balanceInclusion.service';
import * as listados from '../services/listadosCierre.service';
import { armarSimat, csvSimat, excelSimat } from '../services/simat.service';
import { auditarDescargaC600, FiltrosC600, generarReporteC600 } from '../services/c600.service';
import { generarExcelC600 } from '../services/c600Excel.service';
import { generarPdfC600 } from '../services/c600Pdf.service';
import { FiltrosConsolidado, reporteConsolidado } from '../services/consolidadoInstitucional.service';
import { generarExcelTabular } from '../services/reporteTabularExcel.service';
import { generarPdfTabular } from '../services/reporteTabularPdf.service';
import { PERIODO_INFORME_FINAL } from '../constants/boletin';
import { exigirGrupoConsultable } from '../services/informeFinal.service';
import { generarPdfInformeFinal, generarPdfInformeFinalDeFamilia } from '../services/informeFinalPdf.service';
import * as publicacionService from '../services/publicacionBoletin.service';
import * as sabanaService from '../services/sabanaCalificaciones.service';
import { generarExcelSabana } from '../services/sabanaExcel.service';
import { generarPdfSabana } from '../services/sabanaPdf.service';
import catchAsync from '../utils/catchAsync';

type ConsultaSabana = ParsedQs & Omit<sabanaService.FiltrosSabana, 'periodo_numero'> & { periodo_numero?: string };

const filtros = (q: ConsultaSabana): sabanaService.FiltrosSabana => ({ ...q, periodo_numero: q.periodo_numero ? Number(q.periodo_numero) : undefined });

export const sabanaExcel = catchAsync<unknown, unknown, unknown, ConsultaSabana>(async (req, res) => {
  const { buffer, nombreArchivo } = await generarExcelSabana(await sabanaService.generarSabana(filtros(req.query), req.user!, req.ip));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const sabanaPdf = catchAsync<unknown, unknown, unknown, ConsultaSabana>(async (req, res) => {
  const { buffer, nombreArchivo } = await generarPdfSabana(await sabanaService.generarSabana(filtros(req.query), req.user!, req.ip));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});

// --- Informe final del año ---

type ConsultaInformeFinal = ParsedQs & { academic_year_id: string; group_id: string; student_id?: string };

export const informeFinalPdf = catchAsync<unknown, unknown, unknown, ConsultaInformeFinal>(async (req, res) => {
  const { buffer, nombreArchivo } = await generarPdfInformeFinal({ academic_year_id: req.query.academic_year_id, group_id: req.query.group_id, student_id: req.query.student_id }, req.user!, req.ip);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});

/** El del propio estudiante o de su hijo (acudiente): solo si el administrador lo publicó. */
export const informeFinalDeFamiliaPdf = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id: string; student_id: string }>(async (req, res) => {
  const { buffer, nombreArchivo } = await generarPdfInformeFinalDeFamilia({ academic_year_id: req.query.academic_year_id, student_id: req.query.student_id }, req.user!, req.ip);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const informeFinalPublicacion = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id: string; group_id: string }>(async (req, res) => {
  await exigirGrupoConsultable(req.query.group_id, req.user!);
  const data = await publicacionService.obtenerPublicacion({ group_id: req.query.group_id, academic_year_id: req.query.academic_year_id, periodo_numero: PERIODO_INFORME_FINAL });
  res.status(200).json({ success: true, data });
});

export const publicarInformeFinal = catchAsync<unknown, unknown, { academic_year_id: string; group_id: string; publicado: boolean }>(async (req, res) => {
  const { publicado, ...referencia } = req.body;
  const data = await publicacionService.establecerPublicacionGrupo({ ...referencia, periodo_numero: PERIODO_INFORME_FINAL }, publicado, req.user!, req.ip);
  res.status(200).json({ success: true, data });
});

// --- Listados de cierre (recuperación final, retirados): se arman al pedirlos y salen en Excel o PDF ---

type ConsultaListado = ParsedQs & listados.FiltrosListado;
type Armador = (filtros: listados.FiltrosListado, usuario: NonNullable<Express.Request['user']>, ip?: string | null) => ReturnType<typeof listados.reporteRetirados>;

const listadoExcel = (armar: Armador) =>
  catchAsync<unknown, unknown, unknown, ConsultaListado>(async (req, res) => {
    const { buffer, nombreArchivo } = await generarExcelTabular(await armar(req.query, req.user!, req.ip));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(buffer);
  });

const listadoPdf = (armar: Armador) =>
  catchAsync<unknown, unknown, unknown, ConsultaListado>(async (req, res) => {
    const { buffer, nombreArchivo } = await generarPdfTabular(await armar(req.query, req.user!, req.ip));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
    res.send(buffer);
  });

export const recuperacionFinalExcel = listadoExcel(listados.reporteRecuperacionFinal);
export const recuperacionFinalPdf = listadoPdf(listados.reporteRecuperacionFinal);
export const retiradosExcel = listadoExcel(listados.reporteRetirados);
export const retiradosPdf = listadoPdf(listados.reporteRetirados);
export const servicioSocialExcel = listadoExcel(listados.reporteServicioSocial);
export const servicioSocialPdf = listadoPdf(listados.reporteServicioSocial);
export const balanceInclusionExcel = listadoExcel(reporteBalanceInclusion);
export const balanceInclusionPdf = listadoPdf(reporteBalanceInclusion);

// --- Plantilla de cierre para SIMAT ---

/** Qué falta antes de subir el archivo: totales por situación y advertencias (sin nombres desglosados, sin cierre oficial…). No baja nada. */
export const simatRevision = catchAsync<unknown, unknown, unknown, ConsultaListado>(async (req, res) => {
  const { anio, alcance, revision } = await armarSimat(req.query, req.user!, { descarga: false });
  res.status(200).json({ success: true, data: { anio, alcance, revision } });
});

export const simatExcel = catchAsync<unknown, unknown, unknown, ConsultaListado>(async (req, res) => {
  const { buffer, nombreArchivo } = await excelSimat(await armarSimat(req.query, req.user!, { descarga: true }, req.ip));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const simatCsv = catchAsync<unknown, unknown, unknown, ConsultaListado>(async (req, res) => {
  const { buffer, nombreArchivo } = csvSimat(await armarSimat(req.query, req.user!, { descarga: true }, req.ip));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
});

// --- Libro de calificaciones (registro escolar foliado) ---

export const libroEmitir = catchAsync<unknown, unknown, libros.EntradaLibro>(async (req, res) => {
  const libro = await libros.emitirLibro(req.body, req.user!, req.ip);
  res.status(201).json({ success: true, data: libros.vistaLibro(libro) });
});

export const libroListar = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await libros.listarLibros({ academic_year_id: req.query.academic_year_id }, req.user!) });
});

export const libroPdf = catchAsync<{ id: string }>(async (req, res) => {
  const { buffer, nombreArchivo } = await libros.pdfDeLibro(req.params.id, req.user!, req.ip);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const libroIntegridad = catchAsync<{ id: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await libros.verificarIntegridadLibro(req.params.id, req.user!) });
});

export const libroAnular = catchAsync<{ id: string }, unknown, { motivo: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await libros.anularLibro(req.params.id, req.body.motivo, req.user!, req.ip) });
});

// --- Reporte tipo C-600 (M30): la vista previa y las descargas salen del mismo cálculo ---

type ConsultaC600 = ParsedQs & FiltrosC600;

export const c600Vista = catchAsync<unknown, unknown, unknown, ConsultaC600>(async (req, res) => {
  res.status(200).json({ success: true, data: await generarReporteC600(req.query, req.user!) });
});

export const c600Excel = catchAsync<unknown, unknown, unknown, ConsultaC600>(async (req, res) => {
  const reporte = await generarReporteC600(req.query, req.user!);
  const { buffer, nombreArchivo } = await generarExcelC600(reporte);
  await auditarDescargaC600(reporte, 'excel', req.query.academic_year_id, req.user!, req.ip);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const c600Pdf = catchAsync<unknown, unknown, unknown, ConsultaC600>(async (req, res) => {
  const reporte = await generarReporteC600(req.query, req.user!);
  const { buffer, nombreArchivo } = await generarPdfC600(reporte);
  await auditarDescargaC600(reporte, 'pdf', req.query.academic_year_id, req.user!, req.ip);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});

// --- Consolidado general de la institución ---

type ConsultaConsolidado = ParsedQs & FiltrosConsolidado;

export const consolidadoExcel = catchAsync<unknown, unknown, unknown, ConsultaConsolidado>(async (req, res) => {
  const { buffer, nombreArchivo } = await generarExcelTabular(await reporteConsolidado(req.query, req.user!, req.ip));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const consolidadoPdf = catchAsync<unknown, unknown, unknown, ConsultaConsolidado>(async (req, res) => {
  const { buffer, nombreArchivo } = await generarPdfTabular(await reporteConsolidado(req.query, req.user!, req.ip));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});
