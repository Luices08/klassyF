import fs from 'fs/promises';
import path from 'path';
import { Types } from 'mongoose';
import { ClaveDocumentoPiar, DOCUMENTOS_PIAR, EstadoExpediente, MAX_BYTES_SOPORTE, RolFirmante, definicionDocumento } from './inclusion.constants';
import Counter from '../../../models/counter.model';
import DocumentoPiar, { DocumentoPiarDocument } from './documentoPiar.model';
import { UserDocument } from '../../../models/user.model';
import ApiError from '../../../utils/ApiError';
import { hashDeActa } from '../comite/comiteConvivencia';
import { detectarFirmaArchivo } from '../../../utils/firmasArchivo';
import { CLAVES_QUE_ACTIVAN, codigoDeDocumento, esMayorDeEdad, firmanteRequerido, huellaDeArchivo } from './inclusion';
import { permisoInclusion } from './permisosInclusion';
import runTransaction from '../../../utils/runTransaction';
import { carpetaInclusion } from '../../../utils/uploadPaths';
import { registrarEvento } from '../../../services/audit.service';
import { construirSnapshot } from './documentoPiarSnapshot.service';
import { activarPorFirma, cargarConPermiso, exigirEditable, identidadDelEstudiante } from './expedienteInclusion.service';
import { comoUsuarioInclusion, noEncontrado } from './inclusionContexto.service';

const ESTADOS_PARA_EMITIR: Record<ClaveDocumentoPiar, EstadoExpediente[]> = {
  ANEXO_INFO_GENERAL: ['EN_CONSTRUCCION', 'LISTO_PARA_ACUERDO', 'ACTIVO'],
  PIAR_AJUSTES: ['EN_CONSTRUCCION', 'LISTO_PARA_ACUERDO', 'ACTIVO'],
  ACTA_ACUERDO_FAMILIA: ['LISTO_PARA_ACUERDO', 'ACTIVO'],
  ACTA_OFICIAL_PIAR: ['LISTO_PARA_ACUERDO', 'ACTIVO'],
  PLAN_APOYO: ['LISTO_PARA_ACUERDO', 'ACTIVO'],
  INFORME_ANUAL: ['ACTIVO'],
};

/** Lo que se firma es el contenido y su identidad: cualquier cambio directo en la base (snapshot, código, versión) cambia la huella. */
export const huellaDelDocumento = (d: Pick<DocumentoPiarDocument, 'clave' | 'codigo' | 'version' | 'snapshot'>) =>
  hashDeActa({ clave: d.clave, codigo: d.codigo, version: d.version, snapshot: d.snapshot });

/**
 * Emite un documento: congela el contenido (snapshot), le asigna consecutivo anual sin huecos y versión, y sustituye la emisión
 * anterior si no se había firmado. Un documento firmado nunca se sustituye: queda como historia y se emite uno nuevo.
 */
export async function emitirDocumento(expedienteId: string, clave: ClaveDocumentoPiar, usuario: UserDocument, ip?: string | null): Promise<DocumentoPiarDocument> {
  const def = definicionDocumento(clave);
  if (!def) throw new ApiError(400, 'Documento desconocido.');
  const { exp, ctx } = await cargarConPermiso(expedienteId, usuario, 'EMITIR_DOCUMENTO');
  await exigirEditable(exp);
  if (!def.tipos_expediente.includes(exp.tipo)) throw new ApiError(409, `El documento «${def.nombre}» no aplica a este tipo de expediente.`);
  if (!exp.consentimiento.otorgado) throw new ApiError(409, 'No se emite ningún documento sin la autorización vigente del responsable legal.');
  if (!ESTADOS_PARA_EMITIR[clave].includes(exp.estado)) throw new ApiError(409, `«${def.nombre}» no se puede emitir con el expediente en estado ${exp.estado}.`);

  const snapshot = await construirSnapshot(clave, exp, ctx, usuario);
  const anio = (snapshot.encabezado as { anio: number | null }).anio ?? new Date().getFullYear();

  const documento = await runTransaction(async (session) => {
    const contador = await Counter.findByIdAndUpdate(`PIAR-${def.prefijo}-${anio}`, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
    const consecutivo = contador?.seq ?? 0;
    const anterior = await DocumentoPiar.findOne({ expediente_id: exp._id, clave }).sort({ version: -1 }).session(session);
    const version = (anterior?.version ?? 0) + 1;
    const codigo = codigoDeDocumento(clave, anio, consecutivo);
    if (anterior && anterior.estado === 'EMITIDO') {
      anterior.estado = 'SUSTITUIDO';
      await anterior.save({ session });
    }
    const [creado] = await DocumentoPiar.create(
      [
        {
          expediente_id: exp._id,
          student_id: exp.student_id,
          academic_year_id: exp.academic_year_id,
          clave,
          version,
          consecutivo,
          codigo,
          snapshot,
          hash: huellaDelDocumento({ clave, codigo, version, snapshot }),
          emitido_por: usuario._id,
          fecha_emision: new Date(),
        },
      ],
      { session }
    );
    if (!creado) throw new ApiError(500, 'No se pudo emitir el documento.');
    return creado;
  });
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_DOCUMENTO_EMITIDO', entidad: 'DocumentoPiar', entidad_id: documento._id, detalle: documento.codigo, ip });
  return documento;
}

const vistaDocumento = (d: DocumentoPiarDocument, vigente: boolean) => ({
  _id: String(d._id),
  clave: d.clave,
  nombre: definicionDocumento(d.clave).nombre,
  numero_anexo: definicionDocumento(d.clave).numero_anexo,
  codigo: d.codigo,
  version: d.version,
  estado: d.estado,
  fecha_emision: d.fecha_emision,
  huella: d.hash.slice(0, 12).toUpperCase(),
  confidencial: definicionDocumento(d.clave).confidencial,
  firmado: d.estado === 'FIRMADO',
  firma: d.firma ? { fecha: d.firma.fecha, firmantes: d.firma.firmantes } : null,
  /** Emitido con un contenido que ya cambió: hay que emitirlo de nuevo antes de firmar. */
  desactualizado: vigente === false,
});

/** Los documentos del expediente que el usuario puede ver: lo confidencial solo lo ve orientación/ADMIN. */
export async function listarDocumentos(expedienteId: string, usuario: UserDocument) {
  const { exp, ctx } = await cargarConPermiso(expedienteId, usuario, 'DESCARGAR_DOCUMENTO');
  const verConfidencial = permisoInclusion(comoUsuarioInclusion(usuario), ctx.contexto, 'DESCARGAR_CONFIDENCIAL');
  const documentos = await DocumentoPiar.find({ expediente_id: exp._id }).sort({ fecha_emision: -1 });
  const visibles = documentos.filter((d) => verConfidencial || !definicionDocumento(d.clave).confidencial);
  return {
    catalogo: DOCUMENTOS_PIAR.filter((d) => d.tipos_expediente.includes(exp.tipo) && (verConfidencial || !d.confidencial)).map((d) => ({
      clave: d.clave,
      nombre: d.nombre,
      numero_anexo: d.numero_anexo,
      confidencial: d.confidencial,
      firma_admin: d.firma_admin,
      emisible_en: ESTADOS_PARA_EMITIR[d.clave],
    })),
    documentos: visibles.map((d) => vistaDocumento(d, (d.snapshot as { version_expediente?: number })?.version_expediente === exp.version)),
    puede_emitir: permisoInclusion(comoUsuarioInclusion(usuario), ctx.contexto, 'EMITIR_DOCUMENTO'),
    puede_firmar_institucional: permisoInclusion(comoUsuarioInclusion(usuario), ctx.contexto, 'FIRMAR_INSTITUCIONAL'),
  };
}

export async function cargarDocumento(id: string, usuario: UserDocument, accionBase: 'DESCARGAR_DOCUMENTO' | 'EMITIR_DOCUMENTO' | 'FIRMAR_INSTITUCIONAL' = 'DESCARGAR_DOCUMENTO') {
  const documento = Types.ObjectId.isValid(id) ? await DocumentoPiar.findById(id) : null;
  if (!documento) throw noEncontrado('Documento');
  const def = definicionDocumento(documento.clave);
  const cargado = await cargarConPermiso(String(documento.expediente_id), usuario, accionBase);
  // Lo confidencial exige además el permiso clínico: 404 igual que si no existiera.
  if (def.confidencial && !permisoInclusion(comoUsuarioInclusion(usuario), cargado.ctx.contexto, 'DESCARGAR_CONFIDENCIAL')) throw noEncontrado('Documento');
  return { documento, ...cargado };
}

/** Recalcula la huella y la compara con la sellada al emitir: detecta una alteración directa en la base. */
export async function verificarIntegridad(id: string, usuario: UserDocument) {
  const { documento } = await cargarDocumento(id, usuario);
  const actual = huellaDelDocumento(documento);
  return { codigo: documento.codigo, hash_emitido: documento.hash, hash_actual: actual, integro: actual === documento.hash };
}

export interface FirmarInput {
  firmantes: { nombre: string; rol: RolFirmante }[];
}

/**
 * Registra que el documento se firmó (en físico) con su escaneo: el archivo queda asociado a ESTA versión emitida y a su huella.
 * La firma institucional del acta es solo del ADMIN (rector). Un acta firmada pasa el expediente a ACTIVO.
 */
export async function firmarDocumento(id: string, datos: FirmarInput, archivo: Express.Multer.File | undefined, usuario: UserDocument, ip?: string | null) {
  const previo = Types.ObjectId.isValid(id) ? await DocumentoPiar.findById(id) : null;
  if (!previo) throw noEncontrado('Documento');
  const def = definicionDocumento(previo.clave);
  const { documento, exp, ctx } = await cargarDocumento(id, usuario, def.firma_admin ? 'FIRMAR_INSTITUCIONAL' : 'EMITIR_DOCUMENTO');

  await exigirEditable(exp);
  if (documento.estado !== 'EMITIDO') throw new ApiError(409, documento.estado === 'FIRMADO' ? 'El documento ya está firmado.' : 'Este documento fue sustituido por una versión más reciente.');
  if ((documento.snapshot as { version_expediente?: number })?.version_expediente !== exp.version) {
    throw new ApiError(409, 'El expediente cambió después de emitir este documento: emítelo de nuevo antes de firmar.');
  }
  if (!archivo) throw new ApiError(400, 'Adjunta el escaneo del documento firmado.');
  if (archivo.size > MAX_BYTES_SOPORTE) throw new ApiError(400, 'El archivo supera el tamaño máximo permitido (5 MB).');
  const firma = detectarFirmaArchivo(archivo.mimetype, archivo.buffer);
  if (!firma) throw new ApiError(400, 'El archivo no es un PDF, JPG, PNG o WEBP válido.');

  const firmantes = datos.firmantes.map((f) => ({ nombre: f.nombre.trim(), rol: f.rol }));
  if (CLAVES_QUE_ACTIVAN.includes(documento.clave)) {
    const identidad = await identidadDelEstudiante(exp, ctx);
    const requerido = firmanteRequerido(identidad.perfil?.fecha_nacimiento ? esMayorDeEdad(identidad.perfil.fecha_nacimiento, new Date()) : false);
    if (!firmantes.some((f) => f.rol === requerido)) {
      throw new ApiError(409, requerido === 'ESTUDIANTE' ? 'El estudiante es mayor de edad: él firma el documento.' : 'El estudiante es menor de edad: firma su acudiente.');
    }
  }
  // La firma institucional es la del ADMIN que registra: queda como directivo firmante sin que nadie la escriba a mano.
  if (def.firma_admin && !firmantes.some((f) => f.rol === 'DIRECTIVO')) firmantes.push({ nombre: `${usuario.nombre} ${usuario.apellido}`, rol: 'DIRECTIVO' });

  const carpeta = path.join(carpetaInclusion(String(exp._id)), 'firmados');
  await fs.mkdir(carpeta, { recursive: true });
  const destino = path.join(carpeta, `${documento.codigo}-${Date.now()}${firma.ext}`);
  await fs.writeFile(destino, archivo.buffer);

  try {
    documento.estado = 'FIRMADO';
    documento.firma = {
      por: usuario._id,
      fecha: new Date(),
      firmantes,
      soporte_path: path.relative(process.cwd(), destino),
      soporte_hash: huellaDeArchivo(archivo.buffer),
      soporte_nombre: archivo.originalname.slice(0, 120),
    };
    await documento.save();
    if (CLAVES_QUE_ACTIVAN.includes(documento.clave) && exp.estado === 'LISTO_PARA_ACUERDO') await activarPorFirma(exp, usuario, ip);
  } catch (err) {
    await fs.rm(destino, { force: true });
    throw err;
  }
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_DOCUMENTO_FIRMADO', entidad: 'DocumentoPiar', entidad_id: documento._id, detalle: documento.codigo, ip });
  return vistaDocumento(documento, true);
}

export async function rutaDelSoporteFirmado(id: string, usuario: UserDocument, ip?: string | null) {
  const { documento } = await cargarDocumento(id, usuario);
  if (!documento.firma) throw new ApiError(404, 'Este documento no tiene escaneo firmado.');
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_DOCUMENTO_DESCARGADO', entidad: 'DocumentoPiar', entidad_id: documento._id, detalle: 'soporte firmado', ip });
  return { ruta: path.resolve(process.cwd(), documento.firma.soporte_path), nombre: documento.firma.soporte_nombre };
}
