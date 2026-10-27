import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { Jornada, TipoDocumento, TipoDocumentoMatricula } from '../constants/enums';
import * as admissionService from '../services/admissionRequest.service';
import * as comprobanteService from '../services/comprobantePreinscripcion.service';
import * as prematriculaService from '../services/prematricula.service';
import * as solicitudDocumentos from '../services/solicitudDocumentos.service';
import * as preinscripcionService from '../services/preinscripcionPublica.service';
import { registrarEvento } from '../services/audit.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface CrearSolicitudBody {
  primer_nombre?: string;
  segundo_nombre?: string;
  primer_apellido?: string;
  segundo_apellido?: string;
  nombre_aspirante?: string;
  apellido_aspirante?: string;
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
  // Sin usuario: la radica la familia desde el sitio público.
  await registrarEvento({
    accion: 'ADMISION_SOLICITADA',
    entidad: 'AdmissionRequest',
    entidad_id: solicitud._id,
    detalle: `Solicitud de ${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante} desde el sitio público`,
    ip: req.ip,
  });
  res.status(201).json({ success: true, data: solicitud });
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
  const solicitud = await solicitudDocumentos.subirDocumentoDeSolicitud(req.params.id, req.params.tipoDocumento, { buffer: req.file.buffer, mimetype: req.file.mimetype }, { id: req.user!._id });
  res.status(200).json({ success: true, data: solicitud });
});

export const quitarDocumentoSolicitud = catchAsync<DocumentoSolicitudParams>(async (req, res) => {
  const solicitud = await solicitudDocumentos.quitarDocumentoDeSolicitud(req.params.id, req.params.tipoDocumento, { id: req.user!._id });
  res.status(200).json({ success: true, data: solicitud });
});

export const descargarDocumentoSolicitud = catchAsync<DocumentoSolicitudParams>(async (req, res) => {
  res.sendFile(await solicitudDocumentos.rutaDeDocumentoDeSolicitud(req.params.id, req.params.tipoDocumento));
});

export const cuposDePrematricula = catchAsync<unknown, unknown, unknown, { academic_year_id: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await prematriculaService.cuposDelAnio(req.query.academic_year_id) });
});

interface VentanaParams extends ParamsDictionary {
  academicYearId: string;
}

export const verVentanaDePrematricula = catchAsync<VentanaParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await prematriculaService.obtenerVentana(req.params.academicYearId) });
});

export const guardarVentanaDePrematricula = catchAsync<VentanaParams, unknown, prematriculaService.DatosVentana>(async (req, res) => {
  res.status(200).json({ success: true, data: await prematriculaService.guardarVentana(req.params.academicYearId, req.body, req.user!, req.ip) });
});

export const reservarCupo = catchAsync<{ id: string } & ParamsDictionary, unknown, { sede_id: string; jornada_id: string }>(async (req, res) => {
  const r = await prematriculaService.reservarCupo(req.params.id, req.body, { id: req.user!._id });
  res.status(200).json({ success: true, data: r.solicitud, aviso: r.aviso, posicion_espera: r.posicion_espera });
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
    accion: 'ADMISION_APROBADA',
    entidad: 'AdmissionRequest',
    entidad_id: solicitud._id,
    detalle: `Solicitud aprobada: ${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante}`,
    ip: req.ip,
  });
  // La aprobación crea el usuario del estudiante y su matrícula preinscrita: así su historial empieza en el origen.
  if (solicitud.enrollment_id) {
    await registrarEvento({
      usuario_id: req.user?._id,
      accion: 'MATRICULA_PREINSCRITA',
      entidad: 'Enrollment',
      entidad_id: solicitud.enrollment_id,
      detalle: `Preinscripción desde la solicitud de admisión${req.body.fecha_limite_legalizacion ? `, plazo para legalizar ${req.body.fecha_limite_legalizacion}` : ''}`,
      ip: req.ip,
    });
  }

  res.status(200).json({ success: true, data: solicitud });
});

interface RechazarBody {
  motivo: string;
}

export const rechazarSolicitud = catchAsync<SolicitudParams, unknown, RechazarBody>(async (req, res) => {
  const solicitud = await admissionService.rechazarSolicitud(req.params.id, req.body.motivo, req.user!._id);
  await registrarEvento({
    usuario_id: req.user?._id,
    accion: 'ADMISION_RECHAZADA',
    entidad: 'AdmissionRequest',
    entidad_id: solicitud._id,
    detalle: `Solicitud rechazada: ${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante}`,
    ip: req.ip,
  });
  res.status(200).json({ success: true, data: solicitud });
});
