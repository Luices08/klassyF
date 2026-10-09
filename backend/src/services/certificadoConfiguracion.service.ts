import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
  CERTIFICADOS,
  CLAVES_CERTIFICADO,
  ClaveCertificado,
  ELEMENTOS_AUTENTICACION,
  ElementoAutenticacion,
  MAX_BYTES_IMAGEN_AUTENTICACION,
  ModoElemento,
  PoliticaDeCertificado,
} from '../constants/certificados';
import { ROLES } from '../constants/roles';
import ConfiguracionCertificados, { ConfiguracionCertificadosDocument } from '../models/configuracionCertificados.model';
import Institution from '../models/institution.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { EntradaElementos, estadoDeElementos } from '../utils/certificados';
import { detectarFirmaArchivo } from '../utils/firmasArchivo';
import { rutaImagenAutenticacion } from '../utils/uploadPaths';
import { registrarEvento } from './audit.service';

export async function obtenerConfiguracion(): Promise<ConfiguracionCertificadosDocument> {
  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(409, 'Configura primero la institución antes de expedir certificados.');
  const existente = await ConfiguracionCertificados.findOne({ institucion_id: institucion._id });
  if (existente) return existente;
  try {
    return await ConfiguracionCertificados.create({ institucion_id: institucion._id });
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya la creó.
    if ((err as { code?: number }).code === 11000) return (await ConfiguracionCertificados.findOne({ institucion_id: institucion._id })) as ConfiguracionCertificadosDocument;
    throw err;
  }
}

/** Solo el administrador (rector) aplica su firma, salvo que haya delegado en la secretaría. */
export const puedeAplicarFirmaRectoria = (config: ConfiguracionCertificadosDocument, usuario: UserDocument): boolean =>
  usuario.rol === ROLES.ADMIN || config.permitir_firma_rectoria_a_secretaria;

export function entradaDeElementos(config: ConfiguracionCertificadosDocument, clave: ClaveCertificado, usuario: UserDocument): EntradaElementos {
  return {
    politica: config.politica[clave] as PoliticaDeCertificado,
    tieneImagen: { rectoria: Boolean(config.rectoria.imagen), secretaria: Boolean(config.secretaria.imagen), sello: Boolean(config.sello.imagen) },
    puedeAplicar: { rectoria: puedeAplicarFirmaRectoria(config, usuario), secretaria: true, sello: true },
  };
}

const nombreCompleto = (u: { nombre: string; apellido: string } | null | undefined): string | null => (u ? `${u.nombre} ${u.apellido}` : null);

/** Lo que ve el usuario en «Firmas y sellos» y lo que la expedición necesita para pintar sus switches. */
export async function vistaConfiguracion(usuario: UserDocument) {
  const config = await obtenerConfiguracion();
  const [rector, secretaria] = await Promise.all([
    config.rectoria.usuario_id ? User.findById(config.rectoria.usuario_id).select('nombre apellido') : null,
    config.secretaria.usuario_id ? User.findById(config.secretaria.usuario_id).select('nombre apellido') : null,
  ]);
  return {
    rectoria: { usuario_id: config.rectoria.usuario_id ? String(config.rectoria.usuario_id) : null, nombre: nombreCompleto(rector), cargo: config.rectoria.cargo, tiene_imagen: Boolean(config.rectoria.imagen) },
    secretaria: { usuario_id: config.secretaria.usuario_id ? String(config.secretaria.usuario_id) : null, nombre: nombreCompleto(secretaria), cargo: config.secretaria.cargo, tiene_imagen: Boolean(config.secretaria.imagen) },
    sello: { tiene_imagen: Boolean(config.sello.imagen) },
    permitir_firma_rectoria_a_secretaria: config.permitir_firma_rectoria_a_secretaria,
    politica: Object.fromEntries(CLAVES_CERTIFICADO.map((c) => [c, config.politica[c]])),
    tipos: CERTIFICADOS.map((c) => ({
      clave: c.clave,
      nombre: c.nombre,
      descripcion: c.descripcion,
      // Cómo quedan los switches de este documento para quien consulta (bloqueado, apagado, sin imagen…).
      elementos: estadoDeElementos(entradaDeElementos(config, c.clave, usuario)),
    })),
  };
}

export interface CambiosFirmante {
  usuario_id?: string | null;
  cargo?: string;
}

export interface CambiosConfiguracionCertificados {
  rectoria?: CambiosFirmante;
  secretaria?: CambiosFirmante;
  permitir_firma_rectoria_a_secretaria?: boolean;
  politica?: Partial<Record<ClaveCertificado, Partial<Record<ElementoAutenticacion, ModoElemento>>>>;
}

async function validarFirmante(usuarioId: string, rolEsperado: 'ADMIN' | 'SECRETARIA', etiqueta: string): Promise<void> {
  const u = await User.findById(usuarioId).select('rol estado');
  if (!u || u.estado !== 'activo') throw new ApiError(400, `El usuario elegido para ${etiqueta} no existe o está inactivo.`);
  if (u.rol !== rolEsperado) throw new ApiError(400, `Para ${etiqueta} se elige un usuario con rol ${rolEsperado === 'ADMIN' ? 'Administrador' : 'Secretaría'}.`);
}

/** Solo el ADMIN la cambia. No toca nada ya expedido: lo emitido conserva sus firmantes, imágenes y texto. */
export async function actualizarConfiguracion(cambios: CambiosConfiguracionCertificados, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador cambia la configuración de certificados.');
  const config = await obtenerConfiguracion();

  if (cambios.rectoria?.usuario_id) await validarFirmante(cambios.rectoria.usuario_id, 'ADMIN', 'Rectoría');
  if (cambios.secretaria?.usuario_id) await validarFirmante(cambios.secretaria.usuario_id, 'SECRETARIA', 'Secretaría Académica');

  for (const [clave, firmante] of [['rectoria', cambios.rectoria], ['secretaria', cambios.secretaria]] as const) {
    if (!firmante) continue;
    if (firmante.usuario_id !== undefined) config.set(`${clave}.usuario_id`, firmante.usuario_id);
    if (firmante.cargo !== undefined) config.set(`${clave}.cargo`, firmante.cargo);
  }
  if (cambios.permitir_firma_rectoria_a_secretaria !== undefined) config.permitir_firma_rectoria_a_secretaria = cambios.permitir_firma_rectoria_a_secretaria;
  for (const [clave, elementos] of Object.entries(cambios.politica ?? {})) {
    for (const [elemento, modo] of Object.entries(elementos ?? {})) config.set(`politica.${clave}.${elemento}`, modo);
  }
  await config.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADOS_CONFIGURACION_ACTUALIZADA', entidad: 'ConfiguracionCertificados', entidad_id: config._id, detalle: Object.keys(cambios).join(', '), ip });
  return vistaConfiguracion(usuario);
}

const campoDeImagen = (elemento: ElementoAutenticacion) => `${elemento}.imagen`;

/**
 * Guarda la imagen de una firma o del sello. El archivo se nombra por su huella y nunca se sobrescribe ni se borra:
 * un certificado ya expedido sigue pudiendo imprimirse con la imagen que tenía.
 */
export async function guardarImagen(elemento: ElementoAutenticacion, archivo: Express.Multer.File | undefined, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador carga las firmas y el sello.');
  if (!archivo) throw new ApiError(400, 'Adjunta la imagen (PNG o JPG).');
  if (archivo.size > MAX_BYTES_IMAGEN_AUTENTICACION) throw new ApiError(400, 'La imagen supera el tamaño máximo permitido (500 KB).');
  const firma = detectarFirmaArchivo(archivo.mimetype, archivo.buffer);
  if (!firma || (firma.ext !== '.png' && firma.ext !== '.jpg')) throw new ApiError(400, 'La imagen debe ser un PNG o JPG válido.');

  const config = await obtenerConfiguracion();
  const hash = createHash('sha256').update(archivo.buffer).digest('hex');
  const destino = rutaImagenAutenticacion(hash, firma.ext);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, archivo.buffer);
  config.set(campoDeImagen(elemento), { hash, ext: firma.ext });
  await config.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADOS_IMAGEN_ACTUALIZADA', entidad: 'ConfiguracionCertificados', entidad_id: config._id, detalle: `${elemento}: ${hash.slice(0, 12)}`, ip });
  return vistaConfiguracion(usuario);
}

/** Quitar la imagen solo la deja de ofrecer para documentos nuevos; el archivo se conserva para reimprimir lo ya expedido. */
export async function quitarImagen(elemento: ElementoAutenticacion, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador quita las firmas y el sello.');
  const config = await obtenerConfiguracion();
  config.set(campoDeImagen(elemento), null);
  await config.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADOS_IMAGEN_ACTUALIZADA', entidad: 'ConfiguracionCertificados', entidad_id: config._id, detalle: `${elemento}: quitada`, ip });
  return vistaConfiguracion(usuario);
}

/** Ruta de la imagen vigente de un elemento (para mostrarla en la pantalla de configuración). */
export async function rutaImagenVigente(elemento: ElementoAutenticacion): Promise<string> {
  const config = await obtenerConfiguracion();
  const imagen = config[elemento].imagen;
  if (!imagen) throw new ApiError(404, 'No hay imagen cargada.');
  return rutaImagenAutenticacion(imagen.hash, imagen.ext);
}

export const ELEMENTOS_VALIDOS: readonly ElementoAutenticacion[] = ELEMENTOS_AUTENTICACION;
