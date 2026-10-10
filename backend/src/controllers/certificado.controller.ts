import { Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { ClaveCertificado, ElementoAutenticacion } from '../constants/certificados';
import { env } from '../config/env';
import * as configuracionService from '../services/certificadoConfiguracion.service';
import * as certificadoService from '../services/certificado.service';
import * as pdfService from '../services/certificadoPdf.service';
import * as plantillaService from '../services/certificadoPlantilla.service';
import * as verificacionService from '../services/certificadoVerificacion.service';
import catchAsync from '../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

/** El QR apunta al sitio público: la variable PUBLIC_URL si existe; si no, el host con el que llegó la petición (detrás de nginx). */
const urlBase = (req: Request): string => env.urlPublica || `${req.protocol}://${req.get('host')}`;

export const obtenerConfiguracion = catchAsync(async (req, res) => ok(res, await configuracionService.vistaConfiguracion(req.user!)));
export const actualizarConfiguracion = catchAsync(async (req, res) => ok(res, await configuracionService.actualizarConfiguracion(req.body, req.user!, req.ip)));
export const guardarImagen = catchAsync<{ elemento: ElementoAutenticacion }>(async (req, res) =>
  ok(res, await configuracionService.guardarImagen(req.params.elemento, req.file, req.user!, req.ip))
);
export const quitarImagen = catchAsync<{ elemento: ElementoAutenticacion }>(async (req, res) =>
  ok(res, await configuracionService.quitarImagen(req.params.elemento, req.user!, req.ip))
);
export const verImagen = catchAsync<{ elemento: ElementoAutenticacion }>(async (req, res) => {
  res.sendFile(await configuracionService.rutaImagenVigente(req.params.elemento, req.user!));
});

export const matriculasDelEstudiante = catchAsync<{ studentId: string }>(async (req, res) =>
  ok(res, await certificadoService.matriculasExpedibles(req.params.studentId, req.user!))
);

export const expedir = catchAsync(async (req, res) => {
  const c = await certificadoService.expedirCertificado(req.body, req.user!, req.ip);
  ok(res, certificadoService.vistaCertificado(c), 201);
});

export const vistaPrevia = catchAsync(async (req, res) => {
  const buffer = await pdfService.generarVistaPreviaPdf(req.body, req.user!, req.ip);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="vista-previa.pdf"');
  res.send(buffer);
});

export const listar = catchAsync<unknown, unknown, unknown, ParsedQs & { student_id?: string; tipo?: ClaveCertificado; estado?: 'VIGENTE' | 'ANULADO'; pagina?: number; limite?: number }>(async (req, res) => {
  const resultado = await certificadoService.listarCertificados(
    { student_id: req.query.student_id, tipo: req.query.tipo, estado: req.query.estado, pagina: Number(req.query.pagina ?? 1), limite: Number(req.query.limite ?? 20) },
    req.user!
  );
  res.status(200).json({ success: true, ...resultado });
});

export const pdf = catchAsync<IdParams>(async (req, res) => {
  const { buffer, nombreArchivo } = await pdfService.generarPdfDeCertificado(req.params.id, urlBase(req), req.user!, req.ip);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const integridad = catchAsync<IdParams>(async (req, res) => ok(res, await certificadoService.verificarIntegridad(req.params.id, req.user!)));
export const anular = catchAsync<IdParams>(async (req, res) => ok(res, await certificadoService.anularCertificado(req.params.id, req.body.motivo, req.user!, req.ip)));

// Público, sin sesión.
export const verificarPublico = catchAsync<unknown, unknown, unknown, ParsedQs & { token?: string; codigo?: string; clave?: string }>(async (req, res) =>
  ok(res, await verificacionService.verificarCertificado({ token: req.query.token, codigo: req.query.codigo, clave: req.query.clave }))
);

// Plantillas (solo ADMIN; el servicio lo exige).
export const listarPlantillas = catchAsync(async (req, res) => ok(res, await plantillaService.listarPlantillas(req.user!)));
export const versionesDePlantilla = catchAsync<{ tipo: ClaveCertificado }>(async (req, res) => ok(res, await plantillaService.versionesDePlantilla(req.params.tipo, req.user!)));
export const publicarPlantilla = catchAsync<{ tipo: ClaveCertificado }>(async (req, res) => {
  const { nota, ...contenido } = req.body;
  ok(res, await plantillaService.publicarPlantilla(req.params.tipo, contenido, nota ?? '', req.user!, req.ip), 201);
});
export const restablecerPlantilla = catchAsync<{ tipo: ClaveCertificado }>(async (req, res) => ok(res, await plantillaService.restablecerPlantilla(req.params.tipo, req.user!, req.ip), 201));
export const vistaPreviaPlantilla = catchAsync<{ tipo: ClaveCertificado }>(async (req, res) => {
  const buffer = await pdfService.generarVistaPreviaDePlantillaPdf(req.params.tipo, req.body, req.user!);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="vista-previa-plantilla.pdf"');
  res.send(buffer);
});
