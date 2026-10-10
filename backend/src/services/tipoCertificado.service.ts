import {
  CLAVES_TIPOS_INICIALES,
  DefinicionCertificado,
  ESTADOS_MATRICULA_EXPEDIBLES,
  EstadoTipoCertificado,
  FuenteCertificado,
  MAX_TIPOS_CERTIFICADO,
  POLITICA_PREDETERMINADA,
  PoliticaDeCertificado,
  TIPOS_INICIALES,
  ClaveCertificado,
} from '../constants/certificados';
import { Rol } from '../constants/enums';
import { requisitosDe } from '../constants/plantillasCertificado';
import { CLAVES_VARIABLES, VARIABLES_CERTIFICADO } from '../constants/variablesCertificado';
import { ROLES } from '../constants/roles';
import CertificadoEmitido from '../models/certificadoEmitido.model';
import ConfiguracionCertificados from '../models/configuracionCertificados.model';
import PlantillaCertificado from '../models/plantillaCertificado.model';
import TipoCertificado, { TipoCertificadoDocument } from '../models/tipoCertificado.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { PermisosTipo, permisosTipo } from '../utils/permisosCertificados';
import { contenidoDe, validarContenido } from '../utils/plantillaCertificado';
import { contenidoInicial } from '../constants/plantillasCertificado';
import { registrarEvento } from './audit.service';
import { obtenerConfiguracion } from './certificadoConfiguracionBase.service';

const ROLES_QUE_GESTIONAN: Rol[] = [ROLES.ADMIN, ROLES.SECRETARIA];

export function exigirGestionDeTipos(usuario: UserDocument): void {
  if (!ROLES_QUE_GESTIONAN.includes(usuario.rol)) throw new ApiError(403, 'Solo Secretaría y el administrador gestionan los tipos de documento.');
}

/** El tipo como lo usa el resto del módulo: datos simples, sin documento de Mongoose. */
export interface TipoDefinido extends DefinicionCertificado {
  estado: EstadoTipoCertificado;
  orden: number;
}

const aTipoDefinido = (t: TipoCertificadoDocument): TipoDefinido => ({
  clave: t.clave,
  nombre: t.nombre,
  prefijo: t.prefijo,
  descripcion: t.descripcion ?? '',
  estados_matricula: [...t.estados_matricula],
  fuentes: [...t.fuentes],
  variables_obligatorias: [...t.variables_obligatorias],
  politica: { rectoria: t.politica.rectoria, secretaria: t.politica.secretaria, sello: t.politica.sello },
  estado: t.estado,
  orden: t.orden,
});

// --- Siembra de los tipos de partida (una sola vez) ---

/**
 * Crea los tipos de partida la primera vez. Después de sembrados son datos como cualquier otro: si el colegio elimina uno, no vuelve a
 * aparecer. En una instalación anterior, la política por documento que ya tenía guardada pasa al tipo correspondiente.
 */
export async function asegurarTiposIniciales(): Promise<void> {
  const config = await obtenerConfiguracion();
  if (config.tipos_sembrados) return;
  const legado = (config.get('politica') ?? {}) as Record<string, Partial<PoliticaDeCertificado> | undefined>;
  await Promise.all(
    TIPOS_INICIALES.map((t, i) =>
      TipoCertificado.updateOne(
        { clave: t.clave },
        {
          $setOnInsert: {
            clave: t.clave,
            nombre: t.nombre,
            prefijo: t.prefijo,
            descripcion: t.descripcion,
            estados_matricula: t.estados_matricula,
            fuentes: t.fuentes,
            variables_obligatorias: t.variables_obligatorias,
            politica: { ...t.politica, ...legado[t.clave] },
            estado: 'ACTIVO',
            orden: i + 1,
            creado_por: null,
          },
        },
        { upsert: true }
      )
    )
  );
  await ConfiguracionCertificados.updateOne({ _id: config._id }, { $set: { tipos_sembrados: true } });
}

// --- Lectura ---

export async function todosLosTipos(): Promise<TipoDefinido[]> {
  await asegurarTiposIniciales();
  return (await TipoCertificado.find().sort({ orden: 1, createdAt: 1 })).map(aTipoDefinido);
}

export async function tiposActivos(): Promise<TipoDefinido[]> {
  return (await todosLosTipos()).filter((t) => t.estado === 'ACTIVO');
}

/** Un tipo por su clave, en cualquier estado (lo expedido de un tipo archivado sigue necesitándolo). */
export async function tipoPorClave(clave: ClaveCertificado): Promise<TipoDefinido> {
  let tipo = await TipoCertificado.findOne({ clave });
  if (!tipo) {
    // La primera vez, los tipos de partida todavía no existen.
    await asegurarTiposIniciales();
    tipo = await TipoCertificado.findOne({ clave });
  }
  if (!tipo) throw new ApiError(404, 'Ese tipo de documento no existe.');
  return aTipoDefinido(tipo);
}

/** El nombre de un tipo para mostrar un documento ya expedido; si el tipo ya no existe, la clave. */
export async function nombresDeTipos(claves: string[]): Promise<Map<string, string>> {
  const unicas = [...new Set(claves)];
  const tipos = await TipoCertificado.find({ clave: { $in: unicas } }).select('clave nombre');
  return new Map(unicas.map((c) => [c, tipos.find((t) => t.clave === c)?.nombre ?? c]));
}

async function emitidosPorTipo(): Promise<Map<string, number>> {
  const filas = await CertificadoEmitido.aggregate<{ _id: string; total: number }>([{ $group: { _id: '$tipo', total: { $sum: 1 } } }]);
  return new Map(filas.map((f) => [f._id, f.total]));
}

const emitidosDe = (clave: string): Promise<number> => CertificadoEmitido.countDocuments({ tipo: clave });

// --- Gestión ---

export interface VistaTipo extends TipoDefinido {
  emitidos: number;
  puede: PermisosTipo;
}

const vistaTipo = (t: TipoDefinido, emitidos: number, usuario: UserDocument): VistaTipo => ({ ...t, emitidos, puede: permisosTipo(usuario.rol, t.estado) });

export async function listarTipos(usuario: UserDocument) {
  exigirGestionDeTipos(usuario);
  const [tipos, emitidos] = await Promise.all([todosLosTipos(), emitidosPorTipo()]);
  return {
    tipos: tipos.map((t) => vistaTipo(t, emitidos.get(t.clave) ?? 0, usuario)),
    estados_matricula: ESTADOS_MATRICULA_EXPEDIBLES,
    // Las variables que un tipo puede exigir además de los mínimos (el ADMIN las elige).
    variables: VARIABLES_CERTIFICADO.map((v) => ({ clave: v.clave, etiqueta: v.etiqueta, fuente: v.fuente ?? null })),
    maximo: MAX_TIPOS_CERTIFICADO,
  };
}

const sinTildes = (texto: string): string => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Una clave estable a partir del nombre; nunca repite una existente ni una de los tipos de partida. */
function claveDesdeNombre(nombre: string, existentes: Set<string>): string {
  const base = sinTildes(nombre).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34) || 'DOCUMENTO';
  let clave = base;
  let n = 2;
  while (existentes.has(clave) || CLAVES_TIPOS_INICIALES.includes(clave)) clave = `${base}_${n++}`;
  return clave;
}

export interface EntradaTipo {
  nombre: string;
  descripcion?: string;
  prefijo: string;
  estados_matricula: string[];
  fuentes: FuenteCertificado[];
}

const normalizarEntrada = (e: Pick<EntradaTipo, 'nombre' | 'descripcion' | 'prefijo'>) => ({ nombre: e.nombre.trim(), descripcion: (e.descripcion ?? '').trim(), prefijo: e.prefijo.trim().toUpperCase() });

async function exigirPrefijoLibre(prefijo: string, excepto?: string): Promise<void> {
  const otro = await TipoCertificado.findOne({ prefijo, ...(excepto ? { clave: { $ne: excepto } } : {}) }).select('nombre');
  if (otro) throw new ApiError(409, `El prefijo «${prefijo}» ya lo usa «${otro.nombre}»: el código de cada documento empieza por su prefijo y no se puede repetir.`);
}

/** Todo tipo nuevo nace en borrador: se redacta su texto, se prueba con la vista previa y el ADMIN lo activa. */
export async function crearTipo(entrada: EntradaTipo, usuario: UserDocument, ip?: string | null): Promise<VistaTipo> {
  exigirGestionDeTipos(usuario);
  const datos = normalizarEntrada(entrada);
  const existentes = await TipoCertificado.find().select('clave');
  if (existentes.length >= MAX_TIPOS_CERTIFICADO) throw new ApiError(409, `Se llegó al máximo de ${MAX_TIPOS_CERTIFICADO} tipos de documento: elimina o archiva alguno que no se use.`);
  await asegurarTiposIniciales();
  await exigirPrefijoLibre(datos.prefijo);
  const clave = claveDesdeNombre(datos.nombre, new Set(existentes.map((t) => t.clave)));
  const orden = ((await TipoCertificado.findOne().sort({ orden: -1 }).select('orden'))?.orden ?? 0) + 1;
  const creado = await TipoCertificado.create({
    clave,
    ...datos,
    estados_matricula: entrada.estados_matricula,
    fuentes: entrada.fuentes,
    variables_obligatorias: [],
    politica: structuredClone(POLITICA_PREDETERMINADA),
    estado: 'BORRADOR',
    orden,
    creado_por: usuario._id,
  });
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADO_TIPO_CREADO', entidad: 'TipoCertificado', entidad_id: creado._id, detalle: `${clave} (${datos.prefijo})`, ip });
  return vistaTipo(aTipoDefinido(creado), 0, usuario);
}

export interface CambiosTipo {
  nombre?: string;
  descripcion?: string;
  prefijo?: string;
  estados_matricula?: string[];
  fuentes?: FuenteCertificado[];
  variables_obligatorias?: string[];
}

async function cargarTipo(clave: string): Promise<TipoCertificadoDocument> {
  await asegurarTiposIniciales();
  const tipo = await TipoCertificado.findOne({ clave });
  if (!tipo) throw new ApiError(404, 'Ese tipo de documento no existe.');
  return tipo;
}

export async function actualizarTipo(clave: string, cambios: CambiosTipo, usuario: UserDocument, ip?: string | null): Promise<VistaTipo> {
  exigirGestionDeTipos(usuario);
  const tipo = await cargarTipo(clave);
  const puede = permisosTipo(usuario.rol, tipo.estado);
  if (!puede.editar) {
    throw new ApiError(403, usuario.rol === ROLES.SECRETARIA && tipo.estado === 'ACTIVO' ? 'Un tipo activo solo lo edita el administrador.' : 'No puedes editar este tipo de documento.');
  }
  const emitidos = await emitidosDe(clave);

  if (cambios.prefijo !== undefined && cambios.prefijo.trim().toUpperCase() !== tipo.prefijo) {
    if (emitidos > 0) throw new ApiError(409, 'Ya se expidieron documentos de este tipo: su prefijo es parte de sus códigos y no se cambia.');
    if (tipo.estado !== 'BORRADOR') throw new ApiError(409, 'El prefijo solo se cambia mientras el tipo está en borrador.');
    const prefijo = cambios.prefijo.trim().toUpperCase();
    await exigirPrefijoLibre(prefijo, clave);
    tipo.prefijo = prefijo;
  }
  if (cambios.fuentes !== undefined && [...cambios.fuentes].sort().join() !== [...tipo.fuentes].sort().join()) {
    if (emitidos > 0 || tipo.estado !== 'BORRADOR') throw new ApiError(409, 'Las fuentes de datos solo se cambian mientras el tipo está en borrador y sin documentos expedidos.');
    tipo.fuentes = cambios.fuentes;
  }
  if (cambios.variables_obligatorias !== undefined) {
    if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador define qué datos no puede perder el texto del documento.');
    const desconocidas = cambios.variables_obligatorias.filter((v) => !CLAVES_VARIABLES.has(v));
    if (desconocidas.length > 0) throw new ApiError(400, `Variables desconocidas: ${desconocidas.join(', ')}.`);
    tipo.variables_obligatorias = [...new Set(cambios.variables_obligatorias)];
  }
  if (cambios.nombre !== undefined) tipo.nombre = cambios.nombre.trim();
  if (cambios.descripcion !== undefined) tipo.descripcion = cambios.descripcion.trim();
  if (cambios.estados_matricula !== undefined) tipo.estados_matricula = cambios.estados_matricula as typeof tipo.estados_matricula;
  await tipo.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADO_TIPO_ACTUALIZADO', entidad: 'TipoCertificado', entidad_id: tipo._id, detalle: `${clave}: ${Object.keys(cambios).join(', ')}`, ip });
  return vistaTipo(aTipoDefinido(tipo), emitidos, usuario);
}

/** Activar es del ADMIN y exige que el texto vigente cumpla los mínimos del documento: nada a medias llega a la expedición. */
export async function activarTipo(clave: string, usuario: UserDocument, ip?: string | null): Promise<VistaTipo> {
  exigirGestionDeTipos(usuario);
  const tipo = await cargarTipo(clave);
  if (!permisosTipo(usuario.rol, tipo.estado).activar) {
    throw new ApiError(403, tipo.estado === 'ACTIVO' ? 'El tipo ya está activo.' : 'Solo el administrador activa un tipo de documento.');
  }
  const definido = aTipoDefinido(tipo);
  if (definido.estados_matricula.length === 0) throw new ApiError(409, 'Indica con qué estados de matrícula se puede expedir este documento.');
  const vigente = await PlantillaCertificado.findOne({ tipo: clave, estado: 'VIGENTE' });
  const errores = validarContenido(definido, vigente ? contenidoDe(vigente) : contenidoInicial(definido));
  if (errores.length > 0) throw new ApiError(409, 'El texto del documento todavía no cumple lo mínimo para activarlo.', errores);
  tipo.estado = 'ACTIVO';
  await tipo.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADO_TIPO_ACTIVADO', entidad: 'TipoCertificado', entidad_id: tipo._id, detalle: clave, ip });
  return vistaTipo(aTipoDefinido(tipo), await emitidosDe(clave), usuario);
}

/** Archivar saca el tipo de la expedición sin tocar lo ya expedido: sigue verificándose y reimprimiéndose. */
export async function archivarTipo(clave: string, usuario: UserDocument, ip?: string | null): Promise<VistaTipo> {
  exigirGestionDeTipos(usuario);
  const tipo = await cargarTipo(clave);
  if (!permisosTipo(usuario.rol, tipo.estado).archivar) throw new ApiError(409, 'El tipo ya está archivado.');
  tipo.estado = 'ARCHIVADO';
  await tipo.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADO_TIPO_ARCHIVADO', entidad: 'TipoCertificado', entidad_id: tipo._id, detalle: clave, ip });
  return vistaTipo(aTipoDefinido(tipo), await emitidosDe(clave), usuario);
}

/**
 * Elimina un tipo que nunca se usó (con sus borradores de texto). Uno con documentos expedidos no se borra: lo expedido se verifica
 * por QR y su consecutivo no puede quedar con huecos; se archiva.
 */
export async function eliminarTipo(clave: string, usuario: UserDocument, ip?: string | null): Promise<{ clave: string }> {
  exigirGestionDeTipos(usuario);
  const tipo = await cargarTipo(clave);
  const emitidos = await emitidosDe(clave);
  if (emitidos > 0) {
    throw new ApiError(409, `Ya se expidieron ${emitidos} documento(s) de este tipo: no se puede eliminar porque se verifican por su código QR. Archívalo y deja de ofrecerse.`);
  }
  await PlantillaCertificado.deleteMany({ tipo: clave });
  await tipo.deleteOne();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADO_TIPO_ELIMINADO', entidad: 'TipoCertificado', entidad_id: tipo._id, detalle: clave, ip });
  return { clave };
}

/** Las capacidades del tipo con lo que exigen: la pantalla muestra al editar qué mínimos tiene el texto. */
export const requisitosDelTipo = (tipo: TipoDefinido) => requisitosDe(tipo);
