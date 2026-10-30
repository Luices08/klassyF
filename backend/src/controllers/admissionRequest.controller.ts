import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { TipoDocumentoMatricula } from '../constants/enums';
import * as admissionService from '../services/admissionRequest.service';
import * as comprobanteService from '../services/comprobantePreinscripcion.service';
import * as cuposAdmisionService from '../services/cuposAdmision.service';
import * as solicitudDocumentos from '../services/solicitudDocumentos.service';
import * as preinscripcionService from '../services/preinscripcionPublica.service';
import { registrarEvento } from '../services/audit.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

export const crearSolicitud = catchAsync<unknown, unknown, admissionService.CrearSolicitudInput>(async (req, res) => {
  const solicitud = await admissionService.crearSolicitud(req.body);

  // Los adjuntos del formulario público se guardan con la clave que el catálogo usa para ese documento; si el grado no lo pide, no se recibe.
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  if (files) {
    const pedidos = await solicitudDocumentos.documentosQuePideLaSolicitud(solicitud);
    const adjuntos: Array<[string, string]> = [
      ['documento_identidad', 'DOCUMENTO_IDENTIDAD'],
      ['certificado_notas', 'CERTIFICADOS_NOTAS_ANTERIORES'],
    ];
    for (const [campo, tipo] of adjuntos) {
      const f = files[campo]?.[0];
      if (!f || !pedidos.includes(tipo)) continue;
      await solicitudDocumentos.subirDocumentoDeSolicitud(String(solicitud._id), tipo, { buffer: f.buffer, mimetype: f.mimetype, originalname: f.originalname }, null);
    }
  }

  await registrarEvento({
    accion: 'ADMISION_SOLICITADA',
    entidad: 'AdmissionRequest',
    entidad_id: solicitud._id,
    detalle: `Solicitud de ${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante} desde el sitio público`,
    ip: req.ip,
  });

  const finalSolicitud = await admissionService.obtenerSolicitud(String(solicitud._id));
  res.status(201).json({ success: true, data: finalSolicitud });
});

export const registrarInscripcion = catchAsync<unknown, unknown, admissionService.RegistrarInscripcionInput>(async (req, res) => {
  const solicitud = await admissionService.registrarInscripcion(req.body, { id: req.user!._id });
  res.status(201).json({ success: true, data: solicitud });
});

interface DocumentoSolicitudParams extends ParamsDictionary {
  id: string;
  tipoDocumento: string;
}

export const subirDocumentoSolicitud = catchAsync<DocumentoSolicitudParams>(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debes adjuntar un archivo en el campo "file".');
  const solicitud = await solicitudDocumentos.subirDocumentoDeSolicitud(
    req.params.id,
    req.params.tipoDocumento,
    { buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname },
    { id: req.user!._id }
  );
  res.status(200).json({ success: true, data: solicitud });
});

export const quitarDocumentoSolicitud = catchAsync<DocumentoSolicitudParams>(async (req, res) => {
  const solicitud = await solicitudDocumentos.quitarDocumentoDeSolicitud(req.params.id, req.params.tipoDocumento, { id: req.user!._id });
  res.status(200).json({ success: true, data: solicitud });
});

export const descargarDocumentoSolicitud = catchAsync<DocumentoSolicitudParams>(async (req, res) => {
  res.sendFile(await solicitudDocumentos.rutaDeDocumentoDeSolicitud(req.params.id, req.params.tipoDocumento));
});

export const cuposDeAdmision = catchAsync<unknown, unknown, unknown, { academic_year_id: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await cuposAdmisionService.obtenerDisponibilidadCupos(req.query.academic_year_id) });
});
export const cuposDePrematricula = cuposDeAdmision;

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
  academic_year_id?: string;
  grade_id?: string;
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

export const admitirSolicitud = catchAsync<SolicitudParams>(async (req, res) => {
  const solicitud = await admissionService.admitirSolicitud(req.params.id, req.user!._id);
  res.status(200).json({ success: true, data: solicitud });
});

export const aprobarYMatricular = catchAsync<SolicitudParams, unknown, admissionService.AprobarYMatricularInput>(async (req, res) => {
  const solicitud = await admissionService.aprobarYMatricular(req.params.id, req.body, req.user!._id);
  res.status(200).json({ success: true, data: solicitud });
});
export const aprobarSolicitud = aprobarYMatricular;

interface RechazarBody {
  motivo: string;
}

export const rechazarSolicitud = catchAsync<SolicitudParams, unknown, RechazarBody>(async (req, res) => {
  const solicitud = await admissionService.rechazarSolicitud(req.params.id, req.body.motivo, req.user!._id);
  res.status(200).json({ success: true, data: solicitud });
});
