import { ParamsDictionary } from 'express-serve-static-core';
import fs from 'fs/promises';
import path from 'path';
import { EstadoMatricula, TipoDocumentoMatricula } from '../constants/enums';
import * as actaCompromisoService from '../services/actaCompromiso.service';
import * as enrollmentService from '../services/enrollment.service';
import { CreateEnrollmentInput, FormalizacionOpciones, RevisarDocumentoInput } from '../services/enrollment.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { detectarFirmaArchivo } from '../utils/firmasArchivo';
import { carpetaMatricula } from '../utils/uploadPaths';

export const createEnrollment = catchAsync<unknown, unknown, CreateEnrollmentInput>(async (req, res) => {
  const enrollment = await enrollmentService.createEnrollment(req.body, { id: req.user!._id, rol: req.user!.rol });
  res.status(201).json({ success: true, data: enrollment });
});

interface ListQuery {
  academic_year_id?: string;
  group_id?: string;
  estado?: EstadoMatricula;
  search?: string;
  page?: number;
  limit?: number;
}

export const listEnrollments = catchAsync<unknown, unknown, unknown, ListQuery>(async (req, res) => {
  const resultado = await enrollmentService.listarEnrollments(req.query);
  res.status(200).json({ success: true, ...resultado });
});

interface EnrollmentParams extends ParamsDictionary {
  id: string;
}

export const getEnrollment = catchAsync<EnrollmentParams>(async (req, res) => {
  const enrollment = await enrollmentService.obtenerEnrollment(req.params.id);
  res.status(200).json({ success: true, data: enrollment });
});

interface UpdateStatusBody extends FormalizacionOpciones {
  estado: EstadoMatricula;
  motivo?: string;
}

export const updateStatus = catchAsync<EnrollmentParams, unknown, UpdateStatusBody>(async (req, res) => {
  const { estado, motivo, numero_libro, fecha_limite_compromiso } = req.body;
  const enrollment = await enrollmentService.updateEnrollmentStatus(
    req.params.id,
    estado,
    motivo,
    { id: req.user!._id },
    { numero_libro, fecha_limite_compromiso }
  );
  res.status(200).json({ success: true, data: enrollment });
});

interface CambiarGrupoBody {
  group_id: string;
}

export const cambiarGrupo = catchAsync<EnrollmentParams, unknown, CambiarGrupoBody>(async (req, res) => {
  const enrollment = await enrollmentService.cambiarGrupo(req.params.id, req.body.group_id, { id: req.user!._id });
  res.status(200).json({ success: true, data: enrollment });
});

interface ChecklistParams extends ParamsDictionary {
  id: string;
  tipoDocumento: TipoDocumentoMatricula;
}

export const cargarDocumento = catchAsync<ChecklistParams>(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, 'Debes adjuntar un archivo en el campo "file".');

  // El mimetype del multipart lo declara el cliente: se confirma con los primeros bytes del
  // archivo (igual que la carga publica de preinscripcion), y la extension guardada sale de esa
  // firma, nunca del nombre que mando el cliente.
  const firma = detectarFirmaArchivo(file.mimetype, file.buffer);
  if (!firma) throw new ApiError(400, 'El archivo no es un PDF, JPG, PNG o WEBP válido.');

  const carpeta = carpetaMatricula(req.params.id);
  await fs.mkdir(carpeta, { recursive: true });
  const destino = path.join(carpeta, `${req.params.tipoDocumento}-${Date.now()}${firma.ext}`);
  await fs.writeFile(destino, file.buffer);

  const archivoPath = path.relative(process.cwd(), destino);
  const enrollment = await enrollmentService.cargarDocumento(req.params.id, req.params.tipoDocumento, archivoPath, {
    id: req.user!._id,
  });
  res.status(200).json({ success: true, data: enrollment });
});

export const revisarDocumento = catchAsync<ChecklistParams, unknown, RevisarDocumentoInput>(async (req, res) => {
  const enrollment = await enrollmentService.revisarDocumento(req.params.id, req.params.tipoDocumento, req.body, {
    id: req.user!._id,
  });
  res.status(200).json({ success: true, data: enrollment });
});

export const descargarDocumento = catchAsync<ChecklistParams>(async (req, res) => {
  const enrollment = await enrollmentService.obtenerEnrollment(req.params.id);
  const item = enrollment.checklist.find((c) => c.tipo_documento === req.params.tipoDocumento);
  if (!item?.archivo_path) throw new ApiError(404, 'Ese documento todavía no ha sido cargado.');

  res.sendFile(path.resolve(process.cwd(), item.archivo_path));
});

export const descargarActa = catchAsync<EnrollmentParams>(async (req, res) => {
  const enrollment = await enrollmentService.obtenerEnrollment(req.params.id);
  const pdf = await actaCompromisoService.generarActaCompromisoPdf(enrollment);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="acta-compromiso-${enrollment.folio_matricula ?? enrollment.id}.pdf"`);
  res.send(pdf);
});

export const agregarDocumentoChecklist = catchAsync<EnrollmentParams, unknown, enrollmentService.AgregarDocumentoChecklistInput>(
  async (req, res) => {
    const enrollment = await enrollmentService.agregarDocumentoChecklist(req.params.id, req.body, {
      id: req.user!._id,
    });
    res.status(200).json({ success: true, data: enrollment });
  }
);

export const eliminarDocumentoChecklist = catchAsync<ChecklistParams>(async (req, res) => {
  const enrollment = await enrollmentService.eliminarDocumentoChecklist(req.params.id, req.params.tipoDocumento, {
    id: req.user!._id,
  });
  res.status(200).json({ success: true, data: enrollment });
});

export const sincronizarRequisitos = catchAsync<EnrollmentParams>(async (req, res) => {
  const enrollment = await enrollmentService.sincronizarRequisitosMatricula(req.params.id, {
    id: req.user!._id,
  });
  res.status(200).json({ success: true, data: enrollment });
});

export const actualizarComentarioDocumento = catchAsync<ChecklistParams, unknown, { comentario?: string | null }>(
  async (req, res) => {
    const enrollment = await enrollmentService.actualizarComentarioDocumento(
      req.params.id,
      req.params.tipoDocumento,
      req.body.comentario ?? null,
      { id: req.user!._id }
    );
    res.status(200).json({ success: true, data: enrollment });
  }
);
