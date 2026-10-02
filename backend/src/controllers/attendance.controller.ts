import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { EstadoJustificacion, EstadoUsuario } from '../constants/enums';
import * as attendanceService from '../services/attendance.service';
import * as justificacionService from '../services/attendanceJustification.service';
import * as statsService from '../services/attendanceStats.service';
import * as estadoService from '../services/attendanceState.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

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
