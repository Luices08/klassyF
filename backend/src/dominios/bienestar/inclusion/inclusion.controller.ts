import { Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { ClaveDocumentoPiar, EstadoExpediente, EstadoSolicitudApoyo, TipoExpediente } from './inclusion.constants';
import * as ajusteService from './ajusteAsignatura.service';
import * as configuracionService from './configuracionInclusion.service';
import * as documentoService from './documentoPiar.service';
import * as expedienteService from './expedienteInclusion.service';
import { obtenerConfiguracion } from './inclusionContexto.service';
import * as observacionService from '../observador/observacion.service';
import * as pdfService from './piarPdf.service';
import * as solicitudService from './solicitudApoyo.service';
import ApiError from '../../../utils/ApiError';
import catchAsync from '../../../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}
interface AjusteParams extends ParamsDictionary {
  id: string;
  subjectId: string;
}

const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

// --- Buscador (reusa el de convivencia: acotado a las sedes del usuario o a los grupos del docente; no abre /students) ---

export const grupos = catchAsync(async (req, res) => ok(res, await observacionService.gruposAccesibles(req.user!)));

export const estudiantes = catchAsync<unknown, unknown, unknown, ParsedQs & { group_id?: string; q?: string }>(async (req, res) =>
  ok(res, await observacionService.buscarEstudiantes(req.user!, { group_id: req.query.group_id, q: req.query.q }))
);

// --- Configuración ---

export const obtenerConfiguracionInclusion = catchAsync(async (_req, res) => ok(res, await obtenerConfiguracion()));
export const actualizarConfiguracion = catchAsync(async (req, res) => ok(res, await configuracionService.actualizarConfiguracion(req.body, req.user!, req.ip)));

// --- Solicitudes ---

export const crearSolicitud = catchAsync(async (req, res) => {
  const s = await solicitudService.crearSolicitud(req.body, req.user!, req.ip);
  ok(res, { _id: String(s._id), estado: s.estado }, 201);
});

export const bandejaDeSolicitudes = catchAsync<unknown, unknown, unknown, ParsedQs & { estado?: EstadoSolicitudApoyo; pagina?: number; limite?: number }>(async (req, res) => {
  const resultado = await solicitudService.bandejaDeSolicitudes(req.user!, { estado: req.query.estado, pagina: Number(req.query.pagina ?? 1), limite: Number(req.query.limite ?? 20) }, req.ip);
  res.status(200).json({ success: true, ...resultado });
});

export const misSolicitudes = catchAsync(async (req, res) => ok(res, await solicitudService.misSolicitudes(req.user!)));
export const valorarSolicitud = catchAsync<IdParams>(async (req, res) => ok(res, await solicitudService.valorarSolicitud(req.params.id, req.user!, req.ip)));
export const resolverSolicitud = catchAsync<IdParams>(async (req, res) => ok(res, await solicitudService.resolverSolicitud(req.params.id, req.body, req.user!, req.ip)));

// --- Expedientes ---

export const abrirExpediente = catchAsync(async (req, res) => {
  const exp = await expedienteService.abrirExpediente(req.body, req.user!, req.ip);
  ok(res, { _id: String(exp._id), estado: exp.estado }, 201);
});

export const listarExpedientes = catchAsync<unknown, unknown, unknown, ParsedQs & { estado?: EstadoExpediente; tipo?: TipoExpediente; group_id?: string; q?: string; pagina?: number; limite?: number }>(
  async (req, res) => {
    const { pagina, limite, ...filtro } = req.query;
    res.status(200).json({ success: true, ...(await expedienteService.listarExpedientes(req.user!, filtro, { pagina: Number(pagina ?? 1), limite: Number(limite ?? 20) }, req.ip)) });
  }
);

export const misEstudiantes = catchAsync(async (req, res) => ok(res, await expedienteService.misEstudiantesConApoyo(req.user!)));
export const obtenerExpediente = catchAsync<IdParams>(async (req, res) => ok(res, await expedienteService.obtenerExpediente(req.params.id, req.user!, req.ip)));

const seccion = (nombre: Parameters<typeof expedienteService.actualizarSeccion>[1], extraer: (body: Record<string, unknown>) => unknown = (b) => b) =>
  catchAsync<IdParams>(async (req, res) => {
    await expedienteService.actualizarSeccion(req.params.id, nombre, extraer(req.body as Record<string, unknown>), req.user!, req.ip);
    ok(res, { actualizado: nombre });
  });

export const guardarAnexoInfo = seccion('anexo_info_general');
export const guardarCaracteristicas = seccion('caracteristicas');
export const guardarCategoria = seccion('categoria_discapacidad', (b) => b.categoria_discapacidad);
export const guardarTransversales = seccion('transversales', (b) => b.items);
export const guardarPmi = seccion('pmi', (b) => b.items);
export const guardarCompromisosFamilia = seccion('compromisos_familia', (b) => b.items);
export const guardarCompromisosAula = seccion('compromisos_aula', (b) => b.texto);
export const guardarPlanApoyo = seccion('plan_apoyo');
export const guardarInformeAnual = seccion('informe_anual');

export const registrarConsentimiento = catchAsync<IdParams>(async (req, res) => ok(res, await expedienteService.registrarConsentimiento(req.params.id, req.body, req.user!, req.ip), 201));
export const revocarConsentimiento = catchAsync<IdParams>(async (req, res) => ok(res, await expedienteService.revocarConsentimiento(req.params.id, req.body.motivo, req.user!, req.ip)));

export const cargarSoporte = catchAsync<IdParams>(async (req, res) => ok(res, await expedienteService.cargarSoporte(req.params.id, req.file, req.body?.descripcion ?? '', req.user!, req.ip), 201));
export const descargarSoporte = catchAsync<{ id: string; soporteId: string }>(async (req, res) => {
  const { ruta, nombre } = await expedienteService.rutaDelSoporte(req.params.id, req.params.soporteId, req.user!, req.ip);
  res.download(ruta, nombre);
});

export const iniciarConstruccion = catchAsync<IdParams>(async (req, res) => ok(res, await expedienteService.iniciarConstruccion(req.params.id, req.user!, req.ip)));
export const aprobarExpediente = catchAsync<IdParams>(async (req, res) => ok(res, await expedienteService.aprobarExpediente(req.params.id, req.user!, req.ip)));
export const devolverExpediente = catchAsync<IdParams>(async (req, res) => ok(res, await expedienteService.devolverExpediente(req.params.id, req.user!, req.ip)));
export const cerrarExpediente = catchAsync<IdParams>(async (req, res) => ok(res, await expedienteService.cerrarExpediente(req.params.id, req.body.motivo, req.user!, req.ip)));

export const indicadorDeGrupo = catchAsync<{ groupId: string }>(async (req, res) => ok(res, await expedienteService.indicadorDeGrupo(req.params.groupId, req.user!)));

// --- Ajustes ---

export const listarAjustes = catchAsync<IdParams>(async (req, res) => ok(res, await ajusteService.listarAjustes(req.params.id, req.user!)));
export const guardarAjuste = catchAsync<AjusteParams>(async (req, res) => ok(res, await ajusteService.guardarAjuste(req.params.id, req.params.subjectId, req.body, req.user!, req.ip)));
export const registrarSeguimiento = catchAsync<AjusteParams>(async (req, res) => ok(res, await ajusteService.registrarSeguimiento(req.params.id, req.params.subjectId, req.body, req.user!, req.ip), 201));

// --- Documentos ---

export const listarDocumentos = catchAsync<IdParams>(async (req, res) => ok(res, await documentoService.listarDocumentos(req.params.id, req.user!)));
export const emitirDocumento = catchAsync<IdParams, unknown, { clave: ClaveDocumentoPiar }>(async (req, res) => {
  const d = await documentoService.emitirDocumento(req.params.id, req.body.clave, req.user!, req.ip);
  ok(res, { _id: String(d._id), codigo: d.codigo, version: d.version }, 201);
});

export const pdfDeDocumento = catchAsync<IdParams>(async (req, res) => {
  const { buffer, nombreArchivo } = await pdfService.generarPdf(req.params.id, req.user!, req.ip);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const integridadDeDocumento = catchAsync<IdParams>(async (req, res) => ok(res, await documentoService.verificarIntegridad(req.params.id, req.user!)));
export const firmarDocumento = catchAsync<IdParams>(async (req, res) => ok(res, await documentoService.firmarDocumento(req.params.id, req.body, req.file, req.user!, req.ip)));
export const descargarFirmado = catchAsync<IdParams>(async (req, res) => {
  const { ruta, nombre } = await documentoService.rutaDelSoporteFirmado(req.params.id, req.user!, req.ip);
  res.download(ruta, nombre);
});

/** El cuerpo multipart trae `firmantes` como texto JSON: se convierte antes de validar (un JSON inválido es un 400, no un 500). */
export const parsearFirmantes = catchAsync(async (req, _res, next) => {
  if (typeof req.body?.firmantes === 'string') {
    try {
      req.body.firmantes = JSON.parse(req.body.firmantes);
    } catch {
      throw new ApiError(400, 'Los firmantes deben enviarse como una lista JSON válida.');
    }
  }
  next();
});
