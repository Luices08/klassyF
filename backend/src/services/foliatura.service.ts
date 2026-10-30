import { ClientSession } from 'mongoose';
import {
  EsquemaFoliatura,
  ID_CONFIGURACION_FOLIATURA,
  MAX_CAPACIDAD_POR_LIBRO,
  MAX_FOLIO,
  MAX_LIBRO,
} from '../constants/foliatura';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import ConfiguracionFoliatura, { ConfiguracionFoliaturaDocument } from '../models/configuracionFoliatura.model';
import Enrollment from '../models/enrollment.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { libroDeFolio, renderizarMascara, siguienteFolio, validarMascara } from '../utils/foliatura';
import { runTransaction } from '../utils/runTransaction';
import { registrarEvento } from './audit.service';

const ID = ID_CONFIGURACION_FOLIATURA;
const PUEDEN_CONFIGURAR = [ROLES.ADMIN, ROLES.SECRETARIA];

export interface FolioMatricula {
  numero_libro: number;
  numero_folio: number;
  folio_matricula: string;
}

/**
 * Los valores con que nace la configuración. Si el colegio ya tiene folios asentados (una instalación anterior a esta pantalla) sigue exactamente
 * donde iba, en el mismo libro y con el mismo código; si no, arranca en cero con el esquema anual. En ambos casos queda sin confirmar hasta que
 * alguien con permiso la revisa.
 */
async function valoresDePartida(): Promise<{ esquema: EsquemaFoliatura; libro_actual: number | null; contadores: Record<string, number> }> {
  const ultimo = await Enrollment.findOne({ numero_libro: { $ne: null }, numero_folio: { $ne: null } })
    .sort({ numero_libro: -1, numero_folio: -1 })
    .select('numero_libro numero_folio');
  if (!ultimo || ultimo.numero_libro === null || ultimo.numero_folio === null) return { esquema: 'ANUAL', libro_actual: null, contadores: {} };
  return { esquema: 'CONTINUO', libro_actual: ultimo.numero_libro, contadores: { [String(ultimo.numero_libro)]: ultimo.numero_folio } };
}

/**
 * Garantiza que la configuración exista. Se llama ANTES de abrir la transacción de la matrícula: crearla dentro de ella chocaría entre dos primeras
 * matrículas a la vez (el error de clave repetida aborta la transacción) y la lectura de la transacción no vería un documento creado después de abrirla.
 */
export async function asegurarConfiguracion(): Promise<void> {
  if (await ConfiguracionFoliatura.exists({ _id: ID })) return;
  try {
    await ConfiguracionFoliatura.create({ _id: ID, ...(await valoresDePartida()) });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return; // otra petición la creó a la vez
    throw err;
  }
}

export async function obtenerConfiguracion(): Promise<ConfiguracionFoliaturaDocument> {
  await asegurarConfiguracion();
  const config = await ConfiguracionFoliatura.findById(ID);
  if (!config) throw new ApiError(500, 'No se pudo leer la configuración de foliatura.');
  return config;
}

const ULTIMO_FOLIO = (c: ConfiguracionFoliaturaDocument, libro: number): number => c.contadores.get(String(libro)) ?? 0;

/**
 * El siguiente libro y folio del Libro de Matrícula, dentro de la transacción de quien matricula: si esa se deshace, el número vuelve (sin huecos).
 * Es una sola actualización atómica sobre la configuración. En el esquema continuo con capacidad, un libro lleno abre el siguiente con el folio en 1.
 * Un folio ya usado por una matrícula anterior (datos previos a esta configuración) se salta.
 */
export async function asignarFolio(anio: number, session: ClientSession): Promise<FolioMatricula> {
  for (let intento = 0; intento < 10; intento += 1) {
    const config = await ConfiguracionFoliatura.findById(ID).session(session);
    if (!config) throw new ApiError(500, 'La configuración de foliatura no existe: debe crearse antes de abrir la transacción.');

    const libro = libroDeFolio(config.esquema, anio, config.libro_actual);
    const llave = `contadores.${libro}`;
    const capacidad = config.esquema === 'CONTINUO' ? config.capacidad_por_libro : null;
    // Con capacidad, el filtro es lo que impide pasarse del libro aunque dos matrículas lleguen a la vez.
    const filtro = capacidad !== null ? { _id: ID, libro_actual: libro, [llave]: { $lt: capacidad } } : { _id: ID };

    let actualizado = await ConfiguracionFoliatura.findOneAndUpdate(filtro, { $inc: { [llave]: 1 } }, { new: true, session });
    if (actualizado) {
      let folio = ULTIMO_FOLIO(actualizado, libro);
      while (await Enrollment.exists({ numero_libro: libro, numero_folio: folio }).session(session)) {
        actualizado = (await ConfiguracionFoliatura.findOneAndUpdate({ _id: ID }, { $inc: { [llave]: 1 } }, { new: true, session })) ?? actualizado;
        folio = ULTIMO_FOLIO(actualizado, libro);
      }
      if (capacidad === null || folio <= capacidad) {
        if (folio > MAX_FOLIO) throw new ApiError(409, `El libro ${libro} llegó al folio máximo (${MAX_FOLIO}). Abre un libro nuevo en la configuración del Libro de Matrícula.`);
        return { numero_libro: libro, numero_folio: folio, folio_matricula: renderizarMascara(config.mascara, { libro, folio, anio }) };
      }
    }
    // Libro lleno (o cambiado por otra matrícula entre la lectura y la escritura): se abre el siguiente y se intenta de nuevo.
    if (config.esquema === 'ANUAL') throw new ApiError(409, 'No se pudo asignar el folio; vuelve a intentarlo.');
    if (libro + 1 > MAX_LIBRO) throw new ApiError(409, `Se llegó al libro máximo (${MAX_LIBRO}).`);
    await ConfiguracionFoliatura.findOneAndUpdate({ _id: ID, libro_actual: libro }, { $set: { libro_actual: libro + 1, [`contadores.${libro + 1}`]: 0 } }, { session });
  }
  throw new ApiError(409, 'No se pudo asignar el folio del Libro de Matrícula; vuelve a intentarlo.');
}

export interface VistaFoliatura {
  esquema: EsquemaFoliatura;
  mascara: string;
  capacidad_por_libro: number | null;
  libro_actual: number | null;
  /** Último folio asignado en `libro_actual` (en el esquema anual, en el libro de la vigencia de referencia). */
  ultimo_folio: number;
  confirmada: boolean;
  hay_folios_emitidos: boolean;
  total_emitidos: number;
  /** La vigencia con que se calcula el «siguiente» en el esquema anual. */
  anio_de_referencia: number;
  siguiente: { libro: number; folio: number; codigo: string };
}

async function anioDeReferencia(): Promise<number> {
  const anio = (await AcademicYear.findOne({ estado: 'EN_CURSO' }).select('year')) ?? (await AcademicYear.findOne({ estado: { $ne: 'CERRADO' } }).sort({ year: -1 }).select('year'));
  return anio?.year ?? new Date().getFullYear();
}

export async function vistaFoliatura(anio?: number): Promise<VistaFoliatura> {
  const config = await obtenerConfiguracion();
  const referencia = anio ?? (await anioDeReferencia());
  const totalEmitidos = await Enrollment.countDocuments({ numero_folio: { $ne: null } });
  const libroDeReferencia = libroDeFolio(config.esquema, referencia, config.libro_actual);
  const siguiente = siguienteFolio(config, referencia);
  return {
    esquema: config.esquema,
    mascara: config.mascara,
    capacidad_por_libro: config.capacidad_por_libro,
    libro_actual: config.esquema === 'ANUAL' ? libroDeReferencia : config.libro_actual,
    ultimo_folio: ULTIMO_FOLIO(config, libroDeReferencia),
    confirmada: config.confirmada,
    hay_folios_emitidos: totalEmitidos > 0,
    total_emitidos: totalEmitidos,
    anio_de_referencia: referencia,
    siguiente: { ...siguiente, codigo: renderizarMascara(config.mascara, { ...siguiente, anio: referencia }) },
  };
}

export interface CambiosFoliatura {
  esquema: EsquemaFoliatura;
  mascara: string;
  /** Solo cuenta en el esquema continuo. */
  capacidad_por_libro: number | null;
  /** Continuo: el libro en que va el colegio. Anual: la vigencia (el libro se llama como el año) de la que se fija el último folio. */
  libro_actual: number;
  /** El último folio ya asentado en ese libro (en el archivo físico o en el sistema): el siguiente será este más uno. */
  ultimo_folio: number;
  /** Obligatorio cuando ya hay folios asentados: queda en la auditoría. */
  motivo?: string;
}

/**
 * Fija el punto de partida y las reglas de la foliatura (ADMIN y secretaría). Lo ya asentado no se toca y el contador nunca puede quedar por
 * debajo de un folio ya emitido en ese libro; en el continuo, tampoco se vuelve a un libro anterior al último emitido. Una vez que hay folios, todo
 * cambio pide un motivo.
 */
export async function actualizarFoliatura(cambios: CambiosFoliatura, usuario: UserDocument, ip?: string | null): Promise<VistaFoliatura> {
  if (!PUEDEN_CONFIGURAR.includes(usuario.rol)) throw new ApiError(403, 'Solo el administrador y la secretaría académica configuran el Libro de Matrícula.');
  const problema = validarMascara(cambios.mascara);
  if (problema) throw new ApiError(400, problema);
  if (!Number.isInteger(cambios.libro_actual) || cambios.libro_actual < 1 || cambios.libro_actual > MAX_LIBRO) throw new ApiError(400, `El libro debe ser un número entero entre 1 y ${MAX_LIBRO}.`);
  if (!Number.isInteger(cambios.ultimo_folio) || cambios.ultimo_folio < 0 || cambios.ultimo_folio > MAX_FOLIO) throw new ApiError(400, `El último folio debe ser un número entero entre 0 y ${MAX_FOLIO}.`);
  const capacidad = cambios.esquema === 'CONTINUO' ? cambios.capacidad_por_libro : null;
  if (capacidad !== null && (!Number.isInteger(capacidad) || capacidad < 1 || capacidad > MAX_CAPACIDAD_POR_LIBRO)) throw new ApiError(400, `La capacidad por libro debe estar entre 1 y ${MAX_CAPACIDAD_POR_LIBRO} folios.`);
  if (capacidad !== null && cambios.ultimo_folio > capacidad) throw new ApiError(400, 'El último folio no puede pasar de la capacidad del libro.');

  await asegurarConfiguracion();
  const referencia = await anioDeReferencia();
  const motivo = cambios.motivo?.trim() ?? '';
  await runTransaction(async (session) => {
    const actual = await ConfiguracionFoliatura.findById(ID).session(session);
    const libroPrevio = actual ? libroDeFolio(actual.esquema, referencia, actual.libro_actual) : null;
    const ultimoPrevio = actual ? ULTIMO_FOLIO(actual, cambios.libro_actual) : 0;
    const capacidadPrevia = actual && actual.esquema === 'CONTINUO' ? actual.capacidad_por_libro : null;
    const huboCambio =
      !actual ||
      actual.esquema !== cambios.esquema ||
      actual.mascara !== cambios.mascara.trim() ||
      capacidadPrevia !== capacidad ||
      libroPrevio !== cambios.libro_actual ||
      ultimoPrevio !== cambios.ultimo_folio;

    const hayEmitidos = Boolean(await Enrollment.exists({ numero_folio: { $ne: null } }).session(session));
    if (hayEmitidos && huboCambio && motivo.length < 10) {
      throw new ApiError(400, 'Ya hay folios asentados: escribe el motivo del cambio (mínimo 10 caracteres).');
    }

    const emitidoEnElLibro = await Enrollment.findOne({ numero_libro: cambios.libro_actual, numero_folio: { $ne: null } }).sort({ numero_folio: -1 }).select('numero_folio').session(session);
    const mayorEmitido = emitidoEnElLibro?.numero_folio ?? 0;
    if (cambios.ultimo_folio < mayorEmitido) {
      throw new ApiError(409, `En el libro ${cambios.libro_actual} ya hay folios asentados hasta el ${mayorEmitido}: el último folio no puede ser menor.`);
    }
    if (cambios.esquema === 'CONTINUO') {
      const libroMayor = await Enrollment.findOne({ numero_libro: { $ne: null } }).sort({ numero_libro: -1 }).select('numero_libro').session(session);
      if (libroMayor?.numero_libro && cambios.libro_actual < libroMayor.numero_libro) {
        throw new ApiError(409, `Ya hay folios asentados en el libro ${libroMayor.numero_libro}: no se puede volver a un libro anterior.`);
      }
    }

    await ConfiguracionFoliatura.updateOne(
      { _id: ID },
      { $set: { esquema: cambios.esquema, mascara: cambios.mascara.trim(), capacidad_por_libro: capacidad, libro_actual: cambios.libro_actual, [`contadores.${cambios.libro_actual}`]: cambios.ultimo_folio, confirmada: true, actualizado_por: usuario._id } },
      { session }
    );
  });

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'FOLIATURA_CONFIGURADA',
    entidad: 'ConfiguracionFoliatura',
    entidad_id: null, // el id de la configuración es un texto fijo, no un ObjectId
    detalle: `${cambios.esquema}, libro ${cambios.libro_actual}, último folio ${cambios.ultimo_folio}${capacidad !== null ? `, ${capacidad} folios por libro` : ''}, máscara ${cambios.mascara.trim()}${motivo ? ` — motivo: ${motivo}` : ''}`,
    ip,
  });
  return vistaFoliatura();
}
