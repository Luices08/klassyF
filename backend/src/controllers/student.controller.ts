import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoEstudiante } from '../constants/enums';
import * as studentService from '../services/student.service';
import { registrarEvento } from '../services/audit.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface ListarQuery {
  search?: string;
  estado?: EstadoEstudiante;
  eps?: string;
  discapacidad?: boolean;
  page?: number;
  limit?: number;
}

export const listarEstudiantes = catchAsync<unknown, unknown, unknown, ListarQuery>(async (req, res) => {
  const resultado = await studentService.listarEstudiantes(req.query, req.user!.rol);
  res.status(200).json({ success: true, ...resultado });
});

interface StudentParams extends ParamsDictionary {
  id: string;
}

export const obtenerFicha360 = catchAsync<StudentParams>(async (req, res) => {
  const ficha = await studentService.obtenerFicha360(req.params.id, req.user!.rol);
  res.status(200).json({ success: true, data: ficha });
});

export const bulkImportStudents = catchAsync(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, 'Debes adjuntar un archivo CSV en el campo "file".');

  const resultado = await studentService.importarEstudiantesCsv(file.buffer, req.user!._id);

  await registrarEvento({
    usuario_id: req.user?._id,
    accion: 'USUARIOS_IMPORTADOS',
    entidad: 'User',
    detalle: `Estudiantes: ${resultado.creados} creados, ${resultado.errores.length} con error de ${resultado.total_filas} filas`,
    ip: req.ip,
  });

  res.status(200).json({ success: true, data: resultado });
});

export const crearEstudianteCompleto = catchAsync(async (req, res) => {
  const resultado = await studentService.crearEstudianteCompleto(req.body, req.user!._id);

  await registrarEvento({
    usuario_id: req.user?._id,
    accion: 'USUARIO_CREADO',
    entidad: 'User',
    entidad_id: resultado.estudiante._id,
    detalle: `Estudiante creado: ${resultado.estudiante.nombre} ${resultado.estudiante.apellido} (${resultado.estudiante.numero_documento})`,
    ip: req.ip,
  });

  res.status(201).json({ success: true, data: resultado });
});
