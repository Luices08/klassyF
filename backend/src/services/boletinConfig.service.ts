import { FRASES_POR_DEFECTO, MAX_BYTES_ESCUDO, PlantillaBoletin, TIPOS_FRASE_BOLETIN, TipoFraseBoletin } from '../constants/boletin';
import { NIVELES_DESEMPENO, NivelDesempeno } from '../constants/enums';
import AcademicYear from '../models/academicYear.model';
import ConfiguracionBoletin, { ConfiguracionBoletinDocument } from '../models/configuracionBoletin.model';
import FraseDesempeno from '../models/fraseDesempeno.model';
import Institution from '../models/institution.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { imagenDesdeDataUri } from '../utils/almacenImagenes';
import { completarPlantilla } from '../utils/plantillaBoletin';
import { registrarEvento } from './audit.service';

export interface EntregaInput {
  academic_year_id: string;
  periodo_numero: number;
  fecha_entrega: Date;
}

export interface CambiosConfiguracionBoletin {
  canal_reclamaciones?: string;
  mostrar_puesto?: boolean;
  /** Reemplaza la lista completa de fechas de entrega. */
  entregas?: EntregaInput[];
  /** Reemplaza el diseño completo del boletín; lo que falte se completa con el diseño original. */
  plantilla?: PlantillaBoletin;
}

export interface ConfiguracionBoletinVista {
  canal_reclamaciones: string;
  mostrar_puesto: boolean;
  entregas: Array<{ academic_year_id: string; periodo_numero: number; fecha_entrega: Date }>;
  /** Siempre completa: lo que el colegio no personalizó viene con el diseño original. */
  plantilla: PlantillaBoletin;
}

/**
 * La configuración tal como se usa para leer (boletines, PDF, vista previa): no crea nada y no exige que la institución ya exista,
 * así el colegio ve y prueba el diseño del boletín desde el primer día. Sin configuración guardada rige lo de partida.
 */
export async function leerConfiguracionBoletin(): Promise<ConfiguracionBoletinVista> {
  const guardada = await ConfiguracionBoletin.findOne().lean();
  return {
    canal_reclamaciones: guardada?.canal_reclamaciones ?? '',
    mostrar_puesto: guardada?.mostrar_puesto ?? true,
    entregas: (guardada?.entregas ?? []).map((e) => ({ academic_year_id: String(e.academic_year_id), periodo_numero: e.periodo_numero, fecha_entrega: e.fecha_entrega })),
    plantilla: completarPlantilla(guardada?.plantilla),
  };
}

/** El escudo propio debe ser un PNG/JPG real (no basta el prefijo del data URI) y de peso razonable: el PDF lo incrusta en cada hoja. */
export function validarEscudo(url: string | null | undefined): void {
  if (!url) return;
  const imagen = imagenDesdeDataUri(url);
  if (!imagen) throw new ApiError(400, 'El escudo debe ser una imagen PNG o JPG.');
  if (imagen.buffer.length > MAX_BYTES_ESCUDO) throw new ApiError(400, 'El escudo no puede pesar más de 500 KB.');
  const esPng = imagen.buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const esJpg = imagen.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (!esPng && !esJpg) throw new ApiError(400, 'El archivo del escudo no es una imagen PNG o JPG válida.');
}

export async function obtenerConfiguracionBoletin(): Promise<ConfiguracionBoletinDocument> {
  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(409, 'Configura primero la institución antes de configurar el boletín.');
  const existente = await ConfiguracionBoletin.findOne({ institucion_id: institucion._id });
  if (existente) return existente;
  try {
    return await ConfiguracionBoletin.create({ institucion_id: institucion._id });
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya la creó.
    if ((err as { code?: number }).code === 11000) {
      return (await ConfiguracionBoletin.findOne({ institucion_id: institucion._id })) as ConfiguracionBoletinDocument;
    }
    throw err;
  }
}

/** Una fecha de entrega solo tiene sentido sobre un periodo que existe en ese año lectivo. */
async function validarEntregas(entregas: EntregaInput[]): Promise<void> {
  const vistas = new Set<string>();
  for (const entrega of entregas) {
    const clave = `${entrega.academic_year_id}|${entrega.periodo_numero}`;
    if (vistas.has(clave)) throw new ApiError(400, `El periodo ${entrega.periodo_numero} tiene más de una fecha de entrega.`);
    vistas.add(clave);
    const anio = await AcademicYear.findById(entrega.academic_year_id).select('periodos year');
    if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
    if (!anio.periodos.some((p) => p.numero === entrega.periodo_numero)) {
      throw new ApiError(400, `El año ${anio.year} no tiene un periodo ${entrega.periodo_numero}.`);
    }
  }
}

export async function actualizarConfiguracionBoletin(
  cambios: CambiosConfiguracionBoletin,
  usuario: UserDocument,
  ip?: string | null
): Promise<ConfiguracionBoletinDocument> {
  const configuracion = await obtenerConfiguracionBoletin();
  if (cambios.entregas) await validarEntregas(cambios.entregas);

  if (cambios.canal_reclamaciones !== undefined) configuracion.canal_reclamaciones = cambios.canal_reclamaciones;
  if (cambios.mostrar_puesto !== undefined) configuracion.mostrar_puesto = cambios.mostrar_puesto;
  if (cambios.entregas) configuracion.set('entregas', cambios.entregas);
  if (cambios.plantilla) {
    validarEscudo(cambios.plantilla.escudo?.url);
    configuracion.set('plantilla', completarPlantilla(cambios.plantilla));
  }
  await configuracion.save();

  // El detalle de auditoría nunca lleva el texto: solo qué campos se tocaron.
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'BOLETIN_CONFIGURACION_ACTUALIZADA',
    entidad: 'ConfiguracionBoletin',
    entidad_id: configuracion._id,
    detalle: Object.keys(cambios).join(', '),
    ip,
  });
  return configuracion;
}

export interface FraseVista {
  nivel: NivelDesempeno;
  tipo: TipoFraseBoletin;
  texto: string;
}

/** La primera vez se siembra el texto de partida (8 textos: 4 niveles × 2 tipos); desde ahí todo es del colegio. */
export async function listarFrases(): Promise<FraseVista[]> {
  if ((await FraseDesempeno.countDocuments()) === 0) {
    const operaciones = NIVELES_DESEMPENO.flatMap((nivel) =>
      TIPOS_FRASE_BOLETIN.map((tipo) => ({
        updateOne: { filter: { nivel, tipo }, update: { $setOnInsert: { nivel, tipo, texto: FRASES_POR_DEFECTO[nivel][tipo] } }, upsert: true },
      }))
    );
    await FraseDesempeno.bulkWrite(operaciones);
  }
  const guardadas = await FraseDesempeno.find().lean();
  return NIVELES_DESEMPENO.flatMap((nivel) =>
    TIPOS_FRASE_BOLETIN.map((tipo) => ({
      nivel,
      tipo,
      texto: guardadas.find((f) => f.nivel === nivel && f.tipo === tipo)?.texto ?? '',
    }))
  );
}

export async function guardarFrase(
  nivel: NivelDesempeno,
  tipo: TipoFraseBoletin,
  texto: string,
  usuario: UserDocument,
  ip?: string | null
): Promise<FraseVista> {
  await listarFrases();
  const frase = await FraseDesempeno.findOneAndUpdate({ nivel, tipo }, { texto }, { new: true, runValidators: true });
  if (!frase) throw new ApiError(404, 'Texto no encontrado.');
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'BOLETIN_FRASE_ACTUALIZADA',
    entidad: 'FraseDesempeno',
    entidad_id: frase._id,
    detalle: `${nivel} / ${tipo}`,
    ip,
  });
  return { nivel, tipo, texto: frase.texto };
}
