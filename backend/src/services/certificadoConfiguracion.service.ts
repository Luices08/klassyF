import { randomBytes } from 'crypto';
import {
  DependenciaPazYSalvo,
  ELEMENTOS_AUTENTICACION,
  ETIQUETA_ELEMENTO,
  ElementoAutenticacion,
  MAX_BYTES_IMAGEN_AUTENTICACION,
  MAX_DEPENDENCIAS_PAZ_Y_SALVO,
  MAX_NOMBRE_DEPENDENCIA,
  ModoElemento,
  PoliticaDeCertificado,
} from '../constants/certificados';
import { ROLES } from '../constants/roles';
import { ConfiguracionCertificadosDocument } from '../models/configuracionCertificados.model';
import TipoCertificado from '../models/tipoCertificado.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { EntradaElementos, estadoDeElementos, opcionesDeDestinatario } from '../utils/certificados';
import { existeImagen, guardarImagenPorContenido } from '../utils/almacenImagenes';
import { detectarFirmaArchivo } from '../utils/firmasArchivo';
import { PermisosCertificados, permisosCertificados } from '../utils/permisosCertificados';
import { rutaImagenAutenticacion } from '../utils/uploadPaths';
import { registrarEvento } from './audit.service';
import { obtenerConfiguracion } from './certificadoConfiguracionBase.service';
import { plantillasVigentes } from './certificadoPlantilla.service';
import { todosLosTipos } from './tipoCertificado.service';

export { obtenerConfiguracion };

/** Rectoría y Secretaría tienen fe pública para estampar las firmas institucionales configuradas. */
export const puedeAplicarFirmaRectoria = (_config: ConfiguracionCertificadosDocument, usuario: UserDocument): boolean =>
  usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.SECRETARIA;

export const permisosDe = (_config: ConfiguracionCertificadosDocument, usuario: UserDocument): PermisosCertificados =>
  permisosCertificados(usuario.rol);

/** Qué imágenes están configuradas Y tienen su archivo en el servidor: una firma cuyo archivo se perdió no se ofrece (saldría un PDF roto). */
export async function presenciaDeImagenes(config: ConfiguracionCertificadosDocument): Promise<Record<ElementoAutenticacion, boolean>> {
  const [rectoria, secretaria, sello] = await Promise.all([existeImagen(config.rectoria.imagen), existeImagen(config.secretaria.imagen), existeImagen(config.sello.imagen)]);
  return { rectoria, secretaria, sello };
}

export function entradaDeElementos(
  config: ConfiguracionCertificadosDocument,
  politica: PoliticaDeCertificado,
  usuario: UserDocument,
  presencia: Record<ElementoAutenticacion, boolean>
): EntradaElementos {
  return {
    politica,
    tieneImagen: presencia,
    puedeAplicar: { rectoria: puedeAplicarFirmaRectoria(config, usuario), secretaria: true, sello: true },
    tieneFirmante: { rectoria: Boolean(config.rectoria.usuario_id), secretaria: Boolean(config.secretaria.usuario_id), sello: true },
  };
}

const nombreCompleto = (u: { nombre: string; apellido: string } | null | undefined): string | null => (u ? `${u.nombre} ${u.apellido}` : null);

/** Lo que ve el usuario en «Firmas y sellos» y lo que la expedición necesita para pintar sus switches. */
export async function vistaConfiguracion(usuario: UserDocument) {
  const config = await obtenerConfiguracion();
  const [presencia, plantillas, tipos] = await Promise.all([presenciaDeImagenes(config), plantillasVigentes(), todosLosTipos()]);
  const [rector, secretaria] = await Promise.all([
    config.rectoria.usuario_id ? User.findById(config.rectoria.usuario_id).select('nombre apellido') : null,
    config.secretaria.usuario_id ? User.findById(config.secretaria.usuario_id).select('nombre apellido') : null,
  ]);
  return {
    rectoria: { usuario_id: config.rectoria.usuario_id ? String(config.rectoria.usuario_id) : null, nombre: nombreCompleto(rector), cargo: config.rectoria.cargo, tiene_imagen: Boolean(config.rectoria.imagen), imagen_faltante: Boolean(config.rectoria.imagen) && !presencia.rectoria },
    secretaria: { usuario_id: config.secretaria.usuario_id ? String(config.secretaria.usuario_id) : null, nombre: nombreCompleto(secretaria), cargo: config.secretaria.cargo, tiene_imagen: Boolean(config.secretaria.imagen), imagen_faltante: Boolean(config.secretaria.imagen) && !presencia.secretaria },
    sello: { tiene_imagen: Boolean(config.sello.imagen), imagen_faltante: Boolean(config.sello.imagen) && !presencia.sello },
    permitir_firma_rectoria_a_secretaria: config.permitir_firma_rectoria_a_secretaria,
    politica: Object.fromEntries(tipos.filter((t) => t.estado !== 'ARCHIVADO').map((t) => [t.clave, t.politica])),
    paz_y_salvo: { dependencias: config.paz_y_salvo.dependencias.map((d) => ({ clave: d.clave, nombre: d.nombre, activa: d.activa })) },
    puede: permisosDe(config, usuario),
    tipos: tipos.map((t) => ({
      clave: t.clave,
      nombre: t.nombre,
      descripcion: t.descripcion,
      estado: t.estado,
      // Las fuentes dicen qué más pide el documento al expedir (dependencias confirmadas, valoraciones, promoción).
      fuentes: t.fuentes,
      // El selector de destinatario/motivo de este documento (la primera opción es la predeterminada). Un tipo archivado no se ofrece.
      destinatarios: plantillas[t.clave] ? opcionesDeDestinatario(plantillas[t.clave] as { destinatarios: Array<{ clave: string; etiqueta: string; frase: string }> }) : [],
      // Cómo quedan los switches de este documento para quien consulta (bloqueado, apagado, sin imagen…).
      elementos: estadoDeElementos(entradaDeElementos(config, t.politica, usuario, presencia)),
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
  /** Por clave de tipo; cada tipo recibe solo lo que cambia. */
  politica?: Record<string, Partial<Record<ElementoAutenticacion, ModoElemento>>>;
  /** La lista completa: lo que no venga se elimina; sin `clave` es una dependencia nueva. */
  paz_y_salvo?: { dependencias: Array<{ clave?: string; nombre: string; activa: boolean }> };
}

function normalizarDependencias(entrada: Array<{ clave?: string; nombre: string; activa: boolean }>): DependenciaPazYSalvo[] {
  if (entrada.length > MAX_DEPENDENCIAS_PAZ_Y_SALVO) throw new ApiError(400, `Máximo ${MAX_DEPENDENCIAS_PAZ_Y_SALVO} dependencias.`);
  const nombres = new Set<string>();
  const claves = new Set<string>();
  return entrada.map((d) => {
    const nombre = d.nombre.trim();
    if (nombre.length < 2 || nombre.length > MAX_NOMBRE_DEPENDENCIA) throw new ApiError(400, `El nombre de cada dependencia lleva entre 2 y ${MAX_NOMBRE_DEPENDENCIA} caracteres.`);
    if (nombres.has(nombre.toLowerCase())) throw new ApiError(400, `La dependencia «${nombre}» está repetida.`);
    nombres.add(nombre.toLowerCase());
    const clave = d.clave?.trim() || `dep-${randomBytes(4).toString('hex')}`;
    if (claves.has(clave)) throw new ApiError(400, 'Hay dependencias con la misma clave.');
    claves.add(clave);
    return { clave, nombre, activa: d.activa };
  });
}

async function validarFirmante(usuarioId: string, rolEsperado: 'ADMIN' | 'SECRETARIA', etiqueta: string): Promise<void> {
  const u = await User.findById(usuarioId).select('rol estado');
  if (!u || u.estado !== 'activo') throw new ApiError(400, `El usuario elegido para ${etiqueta} no existe o está inactivo.`);
  if (u.rol !== rolEsperado) throw new ApiError(400, `Para ${etiqueta} se elige un usuario con rol ${rolEsperado === 'ADMIN' ? 'Administrador' : 'Secretaría'}.`);
}

/** La política por documento vive en cada tipo: se cambia ahí, solo en los tipos que existen y no están archivados. */
async function aplicarPolitica(politica: NonNullable<CambiosConfiguracionCertificados['politica']>): Promise<void> {
  const tipos = await todosLosTipos();
  for (const [clave, elementos] of Object.entries(politica)) {
    const tipo = tipos.find((t) => t.clave === clave);
    if (!tipo || tipo.estado === 'ARCHIVADO') throw new ApiError(400, `El documento «${clave}» no existe o está archivado.`);
    const nueva = { ...tipo.politica, ...elementos };
    await TipoCertificado.updateOne({ clave }, { $set: { politica: nueva } });
  }
}

/**
 * El ADMIN cambia todo. Secretaría solo designa a quien firma como Secretaría Académica y su cargo: quién es el rector,
 * la delegación, la política por documento y las dependencias son del ADMIN. No toca nada ya expedido: lo emitido conserva
 * sus firmantes, imágenes y texto.
 */
export async function actualizarConfiguracion(cambios: CambiosConfiguracionCertificados, usuario: UserDocument, ip?: string | null) {
  const config = await obtenerConfiguracion();
  const permisos = permisosDe(config, usuario);
  if (cambios.rectoria && !permisos.designar.rectoria) throw new ApiError(403, 'Solo el administrador designa a quien firma por Rectoría.');
  if (cambios.secretaria && !permisos.designar.secretaria) throw new ApiError(403, 'No tienes permiso para cambiar quién firma por Secretaría Académica.');
  if ((cambios.permitir_firma_rectoria_a_secretaria !== undefined || cambios.politica || cambios.paz_y_salvo) && !permisos.ajustes) {
    throw new ApiError(403, 'Solo el administrador cambia la delegación, la política por documento y las dependencias del paz y salvo.');
  }

  if (cambios.rectoria?.usuario_id) await validarFirmante(cambios.rectoria.usuario_id, 'ADMIN', 'Rectoría');
  if (cambios.secretaria?.usuario_id) await validarFirmante(cambios.secretaria.usuario_id, 'SECRETARIA', 'Secretaría Académica');
  if (cambios.politica) await aplicarPolitica(cambios.politica);

  for (const [clave, firmante] of [['rectoria', cambios.rectoria], ['secretaria', cambios.secretaria]] as const) {
    if (!firmante) continue;
    if (firmante.usuario_id !== undefined) config.set(`${clave}.usuario_id`, firmante.usuario_id);
    if (firmante.cargo !== undefined) config.set(`${clave}.cargo`, firmante.cargo);
  }
  if (cambios.permitir_firma_rectoria_a_secretaria !== undefined) config.permitir_firma_rectoria_a_secretaria = cambios.permitir_firma_rectoria_a_secretaria;
  if (cambios.paz_y_salvo) config.set('paz_y_salvo.dependencias', normalizarDependencias(cambios.paz_y_salvo.dependencias));
  await config.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADOS_CONFIGURACION_ACTUALIZADA', entidad: 'ConfiguracionCertificados', entidad_id: config._id, detalle: Object.keys(cambios).join(', '), ip });
  return vistaConfiguracion(usuario);
}

function exigirPermisoDeImagen(config: ConfiguracionCertificadosDocument, elemento: ElementoAutenticacion, usuario: UserDocument): void {
  if (permisosDe(config, usuario).imagen[elemento]) return;
  const motivo = elemento === 'rectoria' && usuario.rol === ROLES.SECRETARIA ? 'el administrador no ha delegado la firma de Rectoría en la secretaría.' : 'no tienes permiso sobre este elemento.';
  throw new ApiError(403, `${ETIQUETA_ELEMENTO[elemento]}: ${motivo}`);
}

const campoDeImagen = (elemento: ElementoAutenticacion) => `${elemento}.imagen`;

/**
 * Guarda la imagen de una firma o del sello. El archivo se nombra por su huella y nunca se sobrescribe ni se borra:
 * un certificado ya expedido sigue pudiendo imprimirse con la imagen que tenía.
 */
export async function guardarImagen(elemento: ElementoAutenticacion, archivo: Express.Multer.File | undefined, usuario: UserDocument, ip?: string | null) {
  const config = await obtenerConfiguracion();
  exigirPermisoDeImagen(config, elemento, usuario);
  if (!archivo) throw new ApiError(400, 'Adjunta la imagen (PNG o JPG).');
  if (archivo.size > MAX_BYTES_IMAGEN_AUTENTICACION) throw new ApiError(400, 'La imagen supera el tamaño máximo permitido (500 KB).');
  const firma = detectarFirmaArchivo(archivo.mimetype, archivo.buffer);
  if (!firma || (firma.ext !== '.png' && firma.ext !== '.jpg')) throw new ApiError(400, 'La imagen debe ser un PNG o JPG válido.');

  const { hash, ext } = await guardarImagenPorContenido(archivo.buffer, firma.ext);
  config.set(campoDeImagen(elemento), { hash, ext });
  await config.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADOS_IMAGEN_ACTUALIZADA', entidad: 'ConfiguracionCertificados', entidad_id: config._id, detalle: `${elemento}: ${hash.slice(0, 12)}`, ip });
  return vistaConfiguracion(usuario);
}

/** Quitar la imagen solo la deja de ofrecer para documentos nuevos; el archivo se conserva para reimprimir lo ya expedido. */
export async function quitarImagen(elemento: ElementoAutenticacion, usuario: UserDocument, ip?: string | null) {
  const config = await obtenerConfiguracion();
  exigirPermisoDeImagen(config, elemento, usuario);
  config.set(campoDeImagen(elemento), null);
  await config.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADOS_IMAGEN_ACTUALIZADA', entidad: 'ConfiguracionCertificados', entidad_id: config._id, detalle: `${elemento}: quitada`, ip });
  return vistaConfiguracion(usuario);
}

/** Ruta de la imagen vigente de un elemento (para mostrarla en la pantalla de configuración). */
export async function rutaImagenVigente(elemento: ElementoAutenticacion, usuario: UserDocument): Promise<string> {
  const config = await obtenerConfiguracion();
  exigirPermisoDeImagen(config, elemento, usuario);
  const imagen = config[elemento].imagen;
  if (!imagen) throw new ApiError(404, 'No hay imagen cargada.');
  if (!(await existeImagen(imagen))) throw new ApiError(409, 'El archivo de esta imagen no está en el servidor: vuelve a cargarla.');
  return rutaImagenAutenticacion(imagen.hash, imagen.ext);
}

export const ELEMENTOS_VALIDOS: readonly ElementoAutenticacion[] = ELEMENTOS_AUTENTICACION;
