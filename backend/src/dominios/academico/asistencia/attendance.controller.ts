import { Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { EstadoJustificacion, EstadoUsuario } from '../../../constants/enums';
import * as pdfService from './asistenciaPdf.service';
import * as attendanceService from './attendance.service';
import * as cuadriculaService from './attendanceCuadricula.service';
import * as excelService from './attendanceExcel.service';
import * as justificacionService from './attendanceJustification.service';
import * as statsService from './attendanceStats.service';
import * as estadoService from './attendanceState.service';
import ApiError from '../../../utils/ApiError';
import catchAsync from '../../../utils/catchAsync';

// --- Estados parametrizables ---

export const listarEstados = catchAsync<unknown, unknown, unknown, ParsedQs & { incluir_inactivos?: string }>(
  async (req, res) => {
    const estados = await estadoService.listarEstados(String(req.query.incluir_inactivos) === 'true');
    res.status(200).json({ success: true, count: estados.length, data: estados });
  }
);

export const crearEstado = catchAsync<unknown, unknown, estadoService.DatosEstadoAsistencia>(async (req, res) => {
  const estado = await estadoService.crearEstado(req.body, { usuarioId: req.user!._id, ip: req.ip });
  res.status(201).json({ success: true, data: estado });
});

interface IdParams extends ParamsDictionary {
  id: string;
}

export const actualizarEstado = catchAsync<IdParams, unknown, Partial<estadoService.DatosEstadoAsistencia>>(
  async (req, res) => {
    const estado = await estadoService.actualizarEstado(req.params.id, req.body, {
      usuarioId: req.user!._id,
      ip: req.ip,
    });
    res.status(200).json({ success: true, data: estado });
  }
);

export const cambiarEstadoActivo = catchAsync<IdParams, unknown, { estado: EstadoUsuario }>(async (req, res) => {
  const estado = await estadoService.cambiarEstadoActivo(req.params.id, req.body.estado, {
    usuarioId: req.user!._id,
    ip: req.ip,
  });
  res.status(200).json({ success: true, data: estado });
});

// --- Planilla ---

export const obtenerPlanilla = catchAsync<unknown, unknown, unknown, ParsedQs & attendanceService.ConsultaPlanilla>(
  async (req, res) => {
    const planilla = await attendanceService.obtenerPlanilla(req.query, req.user!);
    res.status(200).json({ success: true, data: planilla });
  }
);

export const registrarAsistencia = catchAsync<unknown, unknown, attendanceService.RegistrarAsistenciaInput>(
  async (req, res) => {
    const planilla = await attendanceService.registrarAsistencia(req.body, req.user!, req.ip);
    res.status(200).json({ success: true, data: planilla });
  }
);

export const descargarPlantillaExcel = catchAsync<unknown, unknown, unknown, ParsedQs & attendanceService.ConsultaPlanilla>(
  async (req, res) => {
    const { buffer, nombreArchivo } = await excelService.generarPlantillaExcel(req.query, req.user!);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(buffer);
  }
);

export const importarPlantillaExcel = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debes adjuntar un archivo en el campo "file".');
  const resultado = await excelService.importarPlantillaExcel(req.file.buffer, req.user!, req.ip);
  res.status(200).json({ success: true, data: resultado });
});

export const listarInasistencias = catchAsync<
  unknown,
  unknown,
  unknown,
  ParsedQs & { student_id: string; academic_year_id: string; periodo_numero?: string }
>(async (req, res) => {
  const inasistencias = await attendanceService.listarInasistencias(
    {
      student_id: req.query.student_id,
      academic_year_id: req.query.academic_year_id,
      periodo_numero: req.query.periodo_numero ? Number(req.query.periodo_numero) : undefined,
    },
    req.user!
  );
  res.status(200).json({ success: true, count: inasistencias.length, data: inasistencias });
});

// --- Estadísticas ---

type EstadisticasQuery = ParsedQs &
  Omit<statsService.ConsultaEstadistica, 'periodo_numero'> & { periodo_numero?: string };

export const obtenerEstadisticas = catchAsync<unknown, unknown, unknown, EstadisticasQuery>(async (req, res) => {
  const estadisticas = await statsService.obtenerEstadisticas(
    { ...req.query, periodo_numero: req.query.periodo_numero ? Number(req.query.periodo_numero) : undefined },
    req.user!
  );
  res.status(200).json({ success: true, data: estadisticas });
});

// --- Justificaciones ---

export const listarJustificaciones = catchAsync<
  unknown,
  unknown,
  unknown,
  ParsedQs & { academic_year_id: string; estado?: EstadoJustificacion; student_id?: string; group_id?: string }
>(async (req, res) => {
  const justificaciones = await justificacionService.listarJustificaciones(req.query, req.user!);
  res.status(200).json({ success: true, count: justificaciones.length, data: justificaciones });
});

export const crearJustificacion = catchAsync<unknown, unknown, justificacionService.CrearJustificacionInput>(
  async (req, res) => {
    const archivo = req.file
      ? { buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname }
      : undefined;
    const justificacion = await justificacionService.crearJustificacion(req.body, archivo, req.user!, req.ip);
    res.status(201).json({ success: true, data: justificacion });
  }
);

export const revisarJustificacion = catchAsync<IdParams, unknown, justificacionService.RevisarJustificacionInput>(
  async (req, res) => {
    const justificacion = await justificacionService.revisarJustificacion(req.params.id, req.body, req.user!, req.ip);
    res.status(200).json({ success: true, data: justificacion });
  }
);

export const descargarSoporte = catchAsync<IdParams>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');
  const { ruta } = await justificacionService.rutaDelSoporte(req.params.id, req.user);
  res.sendFile(ruta);
});

// --- Planilla clásica (cuadrícula mensual) ---

export const listarClases = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id: string; group_id?: string }>(
  async (req, res) => {
    const clases = await cuadriculaService.listarClases(req.query, req.user!);
    res.status(200).json({ success: true, count: clases.length, data: clases });
  }
);

export const obtenerCuadricula = catchAsync<unknown, unknown, unknown, ParsedQs & { group_id: string; subject_id: string; mes: string }>(
  async (req, res) => {
    const cuadricula = await cuadriculaService.construirCuadricula(req.query, req.user!);
    res.status(200).json({ success: true, data: cuadricula });
  }
);

export const guardarCuadricula = catchAsync<unknown, unknown, attendanceService.RegistrarAsistenciaLoteInput>(async (req, res) => {
  const resultado = await attendanceService.registrarAsistenciaLote(req.body, req.user!, req.ip);
  res.status(200).json({ success: true, data: resultado });
});

// --- PDFs ---

function enviarPdf(res: Response, { buffer, nombreArchivo }: { buffer: Buffer; nombreArchivo: string }): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
}

const aNumero = (valor?: string): number | undefined => (valor ? Number(valor) : undefined);

export const pdfPlanilla = catchAsync<
  unknown,
  unknown,
  unknown,
  ParsedQs & { group_id: string; subject_id: string; mes?: string; periodo_numero?: string }
>(async (req, res) => {
  enviarPdf(res, await pdfService.generarPdfPlanilla({ ...req.query, periodo_numero: aNumero(req.query.periodo_numero) }, req.user!));
});

export const pdfConsolidadoGrupo = catchAsync<unknown, unknown, unknown, ParsedQs & { group_id: string; periodo_numero?: string }>(
  async (req, res) => {
    enviarPdf(res, await pdfService.generarPdfConsolidadoGrupo({ ...req.query, periodo_numero: aNumero(req.query.periodo_numero) }, req.user!));
  }
);

export const pdfReporteInstitucional = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id: string; periodo_numero?: string }>(
  async (req, res) => {
    enviarPdf(res, await pdfService.generarPdfReporteInstitucional({ ...req.query, periodo_numero: aNumero(req.query.periodo_numero) }, req.user!));
  }
);

export const pdfFichaEstudiante = catchAsync<
  unknown,
  unknown,
  unknown,
  ParsedQs & { student_id: string; academic_year_id: string; periodo_numero?: string }
>(async (req, res) => {
  enviarPdf(res, await pdfService.generarPdfFichaEstudiante({ ...req.query, periodo_numero: aNumero(req.query.periodo_numero) }, req.user!));
});
