import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import ConfiguracionRecuperaciones, {
  ConfiguracionRecuperacionesDocument,
  IConfiguracionRecuperaciones,
} from '../models/configuracionRecuperaciones.model';
import { UserDocument } from '../models/user.model';
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
export async function obtenerPolitica(anio: AcademicYearDocument): Promise<ConfiguracionRecuperacionesDocument> {
  const existente = await ConfiguracionRecuperaciones.findOne({ academic_year_id: anio._id });
  const numeros = numerosDePeriodos(anio);
  if (existente) return existente;

  const otrosAnios = await AcademicYear.find({ _id: { $ne: anio._id } }).select('_id year');
  const orden = otrosAnios.sort((a, b) => b.year - a.year).map((a) => a._id);
  const anterior = orden.length > 0 ? await ConfiguracionRecuperaciones.findOne({ academic_year_id: { $in: orden } }).sort({ updatedAt: -1 }) : null;

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
    return await ConfiguracionRecuperaciones.create({ academic_year_id: anio._id, ...base });
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya la creó.
    if ((err as { code?: number }).code === 11000) {
      return (await ConfiguracionRecuperaciones.findOne({ academic_year_id: anio._id })) as ConfiguracionRecuperacionesDocument;
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
