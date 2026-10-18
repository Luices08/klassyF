import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import ConfiguracionRecuperaciones, {
  ConfiguracionRecuperacionesDocument,
  IConfiguracionRecuperaciones,
} from '../models/configuracionRecuperaciones.model';
import PoliticaPromocion from '../models/politicaPromocion.model';
import { UserDocument } from '../models/user.model';
import { PoliticaUmbrales } from '../utils/promocion';
import { ClientSession, Types } from 'mongoose';
import ApiError from '../utils/ApiError';
import { integracionDe } from '../utils/integracionRecuperacion';
import { componentesEfectivos } from '../utils/siee';
import { ajustarReglasAPeriodos, PoliticaRecuperacion, politicaInicial, validarPolitica } from '../utils/recuperaciones';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { registrarEvento } from './audit.service';

export type CambiosPoliticaRecuperacion = PoliticaRecuperacion;

export async function cargarAnio(academicYearId: string): Promise<AcademicYearDocument> {
  const anio = await AcademicYear.findById(academicYearId);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  return anio;
}

const numerosDePeriodos = (anio: AcademicYearDocument): number[] => anio.periodos.map((p) => p.numero).sort((a, b) => a - b);

/**
 * La política del año. Si aún no existe se crea una: parte de la del año más reciente que la tenga (así un año nuevo hereda lo que
 * el colegio ya decidió) o, si nunca se configuró, del valor de partida. Siempre queda editable.
 */
export async function obtenerPolitica(anio: AcademicYearDocument, session?: ClientSession): Promise<ConfiguracionRecuperacionesDocument> {
  const query = ConfiguracionRecuperaciones.findOne({ academic_year_id: anio._id });
  if (session) query.session(session);
  const existente = await query;
  const numeros = numerosDePeriodos(anio);
  if (existente) return existente;

  const otrosAniosQuery = AcademicYear.find({ _id: { $ne: anio._id } }).select('_id year');
  if (session) otrosAniosQuery.session(session);
  const otrosAnios = await otrosAniosQuery;
  const orden = otrosAnios.sort((a, b) => b.year - a.year).map((a) => a._id);

  let anterior: ConfiguracionRecuperacionesDocument | null = null;
  if (orden.length > 0) {
    const antQuery = ConfiguracionRecuperaciones.findOne({ academic_year_id: { $in: orden } }).sort({ updatedAt: -1 });
    if (session) antQuery.session(session);
    anterior = await antQuery;
  }

  const base = anterior
    ? {
        periodos: ajustarReglasAPeriodos(anterior.periodos, numeros),
        periodo: {
          efecto: anterior.periodo.efecto,
          max_intentos: anterior.periodo.max_intentos,
          integracion: integracionDe(anterior.periodo.integracion),
        },
        anual: { ...anterior.anual },
        texto_siee: anterior.texto_siee,
      }
    : politicaInicial(numeros);

  try {
    const docs = await ConfiguracionRecuperaciones.create([{ academic_year_id: anio._id, ...base }], { session });
    return docs[0] as ConfiguracionRecuperacionesDocument;
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya la creó.
    if ((err as { code?: number }).code === 11000) {
      const q = ConfiguracionRecuperaciones.findOne({ academic_year_id: anio._id });
      if (session) q.session(session);
      return (await q) as ConfiguracionRecuperacionesDocument;
    }
    throw err;
  }
}

export async function obtenerPoliticaDelAnio(academicYearId: string) {
  const anio = await cargarAnio(academicYearId);
  const politica = await obtenerPolitica(anio);
  return { anio, politica };
}

/**
 * Cambia la política del año. No reescribe recuperaciones ya registradas: cada una guarda el efecto con que se calculó. Un año
 * CERRADO es histórico y no se toca.
 */
export async function actualizarPolitica(
  academicYearId: string,
  cambios: CambiosPoliticaRecuperacion,
  usuario: UserDocument,
  ip?: string | null
): Promise<ConfiguracionRecuperacionesDocument> {
  await asegurarAnioNoCerrado(academicYearId);
  const anio = await cargarAnio(academicYearId);
  // El bloque de la integración debe existir en el molde de notas de ESTE año (M12), que puede diferir del de otro año.
  const problema = validarPolitica(cambios, numerosDePeriodos(anio), componentesEfectivos(anio).map((c) => c.clave));
  if (problema) throw new ApiError(400, problema);

  const politica = await obtenerPolitica(anio);
  // Si la política de promoción ya define la recuperación final, esa es la única fuente: aquí no se puede contradecir.
  const promocion = await PoliticaPromocion.findOne({ academic_year_id: anio._id }).select('umbrales');
  if (promocion?.umbrales?.recuperacion_hasta != null) {
    const a = cambios.anual;
    const actual = politica.anual;
    if (a.aplica !== actual.aplica || a.max_asignaturas_pendientes !== actual.max_asignaturas_pendientes || a.efecto !== actual.efecto) {
      throw new ApiError(409, 'La recuperación de fin de año (si aplica, cuántas asignaturas y qué nota queda) se define en Promoción y cierre de año.');
    }
  }
  politica.set({ ...cambios, actualizado_por: usuario._id } satisfies Partial<IConfiguracionRecuperaciones>);
  await politica.save();

  const aplicanPeriodos = cambios.periodos.filter((r) => r.aplica).map((r) => r.periodo_numero);
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'RECUPERACIONES_POLITICA_ACTUALIZADA',
    entidad: 'ConfiguracionRecuperaciones',
    entidad_id: politica._id,
    detalle:
      `Año ${anio.year}: periodos con recuperación [${aplicanPeriodos.join(', ') || 'ninguno'}], ` +
      `efecto ${cambios.periodo.efecto}, anual ${cambios.anual.aplica ? 'sí' : 'no'}`,
    ip,
  });
  return politica;
}

/**
 * Refleja en la recuperación anual de M18 lo que la política de promoción decidió (umbrales). Solo toca `anual.aplica`, `anual.efecto` y
 * `anual.max_asignaturas_pendientes`; corre en la transacción del guardado de la política. Sin umbral configurado no hace nada (política anterior).
 * Devuelve el detalle para auditar (la auditoría no admite sesión, así que la registra quien llama tras confirmar la transacción) o null.
 */
export async function sincronizarAnualDesdePromocion(anio: AcademicYearDocument, umbrales: PoliticaUmbrales, usuario: UserDocument, session: ClientSession): Promise<{ politica_id: Types.ObjectId; detalle: string } | null> {
  if (umbrales.recuperacion_hasta === null) return null;
  const politica = await obtenerPolitica(anio, session);
  const baseAnual = politica.toObject().anual;
  const anual = {
    ...baseAnual,
    aplica: umbrales.recuperacion_hasta > 0,
    max_asignaturas_pendientes: umbrales.recuperacion_hasta,
    efecto: umbrales.efecto_nota_recuperacion,
    max_intentos: baseAnual?.max_intentos ?? 1,
  };
  const problema = validarPolitica({ ...politica.toObject(), anual }, numerosDePeriodos(anio), componentesEfectivos(anio).map((c) => c.clave));
  if (problema) throw new ApiError(400, problema);
  politica.set({ anual, actualizado_por: usuario._id });
  await politica.save({ session });
  return {
    politica_id: politica._id,
    detalle: `Año ${anio.year}: recuperación anual ${anual.aplica ? `hasta ${anual.max_asignaturas_pendientes}` : 'no aplica'}, efecto ${anual.efecto} (origen: política de promoción)`,
  };
}
