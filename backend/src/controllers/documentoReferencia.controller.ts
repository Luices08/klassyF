import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import * as documentoService from '../services/documentoReferencia.service';
import catchAsync from '../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

export const listarDocumentos = catchAsync<unknown, unknown, unknown, ParsedQs & documentoService.FiltroDocumentosReferencia>(async (req, res) => {
  const documentos = await documentoService.listarDocumentosReferencia(req.query);
  res.status(200).json({ success: true, count: documentos.length, data: documentos });
});

export const crearDocumento = catchAsync<unknown, unknown, documentoService.DatosDocumentoReferencia>(async (req, res) => {
  const documento = await documentoService.crearDocumentoReferencia(req.body, req.file, req.user!, req.ip);
  res.status(201).json({ success: true, data: documento });
});

export const actualizarDocumento = catchAsync<IdParams, unknown, documentoService.CambiosDocumentoReferencia>(async (req, res) => {
  const documento = await documentoService.actualizarDocumentoReferencia(req.params.id, req.body, undefined, req.user!, req.ip);
  res.status(200).json({ success: true, data: documento });
});

export const reemplazarArchivoDocumento = catchAsync<IdParams>(async (req, res) => {
  const documento = await documentoService.actualizarDocumentoReferencia(req.params.id, {}, req.file, req.user!, req.ip);
  res.status(200).json({ success: true, data: documento });
});

export const eliminarDocumento = catchAsync<IdParams>(async (req, res) => {
  await documentoService.eliminarDocumentoReferencia(req.params.id, req.user!, req.ip);
  res.status(200).json({ success: true, data: null });
});

export const descargarDocumento = catchAsync<IdParams>(async (req, res) => {
  const { ruta, nombre } = await documentoService.rutaDelDocumentoReferencia(req.params.id);
  res.download(ruta, nombre, (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, message: 'El archivo del documento ya no está disponible.' });
  });
});
