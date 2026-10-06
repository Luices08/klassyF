import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { Jornada, TipoDocumento, TipoDocumentoMatricula } from '../../../constants/enums';
import * as admissionService from './admissionRequest.service';
import * as comprobanteService from './comprobantePreinscripcion.service';
import * as preinscripcionService from './preinscripcionPublica.service';
import { registrarEvento } from '../../../services/audit.service';
import ApiError from '../../../utils/ApiError';
import catchAsync from '../../../utils/catchAsync';

interface CrearSolicitudBody {
  nombre_aspirante: string;
  apellido_aspirante: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  fecha_nacimiento: string;
  grado_deseado_id: string;
  sede_deseada_id?: string;
  jornada_deseada?: Jornada;
  acudiente_nombre: string;
  acudiente_apellido: string;
  acudiente_telefono: string;
  acudiente_email: string;
  observaciones?: string;
  apoyo_declarado?: { motivo_declarado: string; aporta_soporte?: boolean; observacion?: string };
}

export const crearSolicitud = catchAsync<unknown, unknown, CrearSolicitudBody>(async (req, res) => {
  const solicitud = await admissionService.crearSolicitud(req.body);
  res.status(201).json({ success: true, data: solicitud });
});

interface ConsultarEstadoQuery extends ParsedQs {
  numero_documento: string;
  fecha_nacimiento: string;
}

export const consultarEstado = catchAsync<unknown, unknown, unknown, ConsultarEstadoQuery>(async (req, res) => {
  const resultado = await admissionService.consultarEstado(req.query.numero_documento, req.query.fecha_nacimiento);
  if (!resultado) throw new ApiError(404, 'No se encontró ninguna solicitud con esos datos.');
  res.status(200).json({ success: true, data: resultado });
});

interface CredencialesPreinscripcion {
  numero_documento: string;
  fecha_nacimiento: string;
}

// POST y no GET: documento + fecha de nacimiento de un menor no deben viajar en la URL (logs, historial).
export const descargarComprobante = catchAsync<unknown, unknown, CredencialesPreinscripcion>(async (req, res) => {
  const { pdf, codigo } = await comprobanteService.generarComprobantePreinscripcionPdf(
    req.body.numero_documento,
    req.body.fecha_nacimiento
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="comprobante-preinscripcion-${codigo}.pdf"`);
  res.send(pdf);
});

interface SubirDocumentoParams extends ParamsDictionary {
  tipoDocumento: TipoDocumentoMatricula;
}

export const subirDocumentoPublico = catchAsync<SubirDocumentoParams, unknown, CredencialesPreinscripcion>(
  async (req, res) => {
    if (!req.file) throw new ApiError(400, 'Debes adjuntar un archivo en el campo "file".');
    const detalle = await preinscripcionService.subirDocumento(
      req.body.numero_documento,
      req.body.fecha_nacimiento,
      req.params.tipoDocumento,
      { buffer: req.file.buffer, mimetype: req.file.mimetype }
    );
    res.status(200).json({ success: true, data: detalle });
  }
);

interface ListarQuery {
  estado?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const listarSolicitudes = catchAsync<unknown, unknown, unknown, ListarQuery>(async (req, res) => {
  const resultado = await admissionService.listarSolicitudes(req.query);
  res.status(200).json({ success: true, ...resultado });
});

interface SolicitudParams extends ParamsDictionary {
  id: string;
}

export const obtenerSolicitud = catchAsync<SolicitudParams>(async (req, res) => {
  const solicitud = await admissionService.obtenerSolicitud(req.params.id);
  res.status(200).json({ success: true, data: solicitud });
});

interface AprobarBody {
  group_id: string;
  academic_year_id: string;
  fecha_limite_legalizacion?: string;
}

export const aprobarSolicitud = catchAsync<SolicitudParams, unknown, AprobarBody>(async (req, res) => {
  const solicitud = await admissionService.aprobarSolicitud(req.params.id, req.body, req.user!._id);

  await registrarEvento({
    usuario_id: req.user?._id,
    accion: 'USUARIO_CREADO',
    entidad: 'AdmissionRequest',
    entidad_id: solicitud._id,
    detalle: `Solicitud aprobada: ${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante}`,
    ip: req.ip,
  });

  res.status(200).json({ success: true, data: solicitud });
});

interface RechazarBody {
  motivo: string;
}

export const rechazarSolicitud = catchAsync<SolicitudParams, unknown, RechazarBody>(async (req, res) => {
  const solicitud = await admissionService.rechazarSolicitud(req.params.id, req.body.motivo, req.user!._id);
  res.status(200).json({ success: true, data: solicitud });
});
