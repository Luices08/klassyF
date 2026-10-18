import AcademicYear from '../models/academicYear.model';
import PoliticaPromocion, { PoliticaPromocionDocument } from '../models/politicaPromocion.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { evaluarPromocion, politicaInicial, PoliticaPromocion as DatosPolitica, validarPolitica } from '../utils/promocion';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { CasoSimulado, entradaDeCasoSimulado } from '../utils/simulacionPromocion';
import runTransaction from '../utils/runTransaction';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { registrarEvento } from './audit.service';
import { cargarAnio, obtenerPolitica as obtenerPoliticaRecuperaciones, sincronizarAnualDesdePromocion } from './configuracionRecuperaciones.service';

/** Los campos de la política que viajan al guardar (todos menos los de control). */
export type CambiosPoliticaPromocion = DatosPolitica;

const CAMPOS: Array<keyof DatosPolitica> = [
  'unidad',
  'area_pierde_con_asignatura_perdida',
  'asignaturas_criticas_ids',
  'areas_criticas_ids',
  'asignaturas_arrastrables_ids',
  'areas_arrastrables_ids',
  'reglas',
  'inasistencia',
  'umbrales',
  'imprescindibles',
  'sin_regla',
  'arrastre',
  'piar',
  'titulacion',
  'texto_siee',
];

/** Solo los campos de la política, como JSON plano (sin ids de Mongo ni fechas): es lo que se congela en cada cierre y entra a su huella. */
export function datosDePolitica(doc: PoliticaPromocionDocument): DatosPolitica {
  const plano = JSON.parse(JSON.stringify(doc.toObject())) as DatosPolitica;
  return Object.fromEntries(CAMPOS.map((c) => [c, plano[c]])) as unknown as DatosPolitica;
}

/**
 * La política del año. Si aún no existe se crea: parte de la del año más reciente que la tenga (un año nuevo hereda lo que el colegio ya
 * decidió) o, si nunca se configuró, del valor de partida conservador (todo lo perdido va a recuperación y, tras ella, no se promueve).
 */
export async function obtenerPolitica(academicYearId: string): Promise<PoliticaPromocionDocument> {
  const anio = await cargarAnio(academicYearId);
  const existente = await PoliticaPromocion.findOne({ academic_year_id: anio._id });
  if (existente) return existente;

  const otros = (await AcademicYear.find({ _id: { $ne: anio._id } }).select('_id year')).sort((a, b) => b.year - a.year).map((a) => a._id);
  const anterior = otros.length > 0 ? await PoliticaPromocion.findOne({ academic_year_id: { $in: otros } }).sort({ updatedAt: -1 }) : null;
  const base = anterior ? (Object.fromEntries(CAMPOS.map((c) => [c, anterior.toObject()[c]])) as unknown as DatosPolitica) : politicaInicial();

  try {
    return await PoliticaPromocion.create({ academic_year_id: anio._id, ...base });
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya la creó.
    if ((err as { code?: number }).code === 11000) return (await PoliticaPromocion.findOne({ academic_year_id: anio._id })) as PoliticaPromocionDocument;
    throw err;
  }
}

/** Cambia la política del año. No reescribe cierres ya hechos: cada uno congela la política con la que se evaluó. Un año CERRADO no se toca. */
export async function actualizarPolitica(academicYearId: string, cambios: CambiosPoliticaPromocion, usuario: UserDocument, ip?: string | null): Promise<PoliticaPromocionDocument> {
  await asegurarAnioNoCerrado(academicYearId);
  const anio = await cargarAnio(academicYearId);
  const ultimoPeriodo = Math.max(...anio.periodos.map((p) => p.numero), 0) || undefined;
  const problema = validarPolitica(cambios, ultimoPeriodo);
  if (problema) throw new ApiError(400, problema);

  const politica = await obtenerPolitica(academicYearId);
  // Misma transacción: la recuperación final de M18 debe quedar igual a lo que dice esta política, o ninguna de las dos cambia.
  const sincronizado = await runTransaction(async (session) => {
    politica.set({ ...cambios, actualizado_por: usuario._id });
    await politica.save({ session });
    return sincronizarAnualDesdePromocion(anio, cambios.umbrales, usuario, session);
  });

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'PROMOCION_POLITICA_ACTUALIZADA',
    entidad: 'PoliticaPromocion',
    entidad_id: politica._id,
    detalle: `Año ${anio.year}: ${cambios.reglas.length} reglas, unidad ${cambios.unidad}, arrastre ${cambios.arrastre.admite ? 'sí' : 'no'}${sincronizado ? ', recuperación anual sincronizada con M18' : ''}`,
    ip,
  });
  if (sincronizado) {
    await registrarEvento({
      usuario_id: usuario._id,
      accion: 'RECUPERACIONES_POLITICA_ACTUALIZADA',
      entidad: 'ConfiguracionRecuperaciones',
      entidad_id: sincronizado.politica_id,
      detalle: sincronizado.detalle,
      ip,
    });
  }
  return politica;
}

/**
 * Prueba una política en borrador con un estudiante hipotético y devuelve lo que el motor decidiría. No lee ni escribe estudiantes:
 * usa solo la escala del año y la recuperación vigente de M18 (si el borrador aún no define el tope de recuperación).
 */
export async function simularCaso(academicYearId: string, politica: CambiosPoliticaPromocion, caso: CasoSimulado) {
  const anio = await cargarAnio(academicYearId);
  const ultimoPeriodo = Math.max(...anio.periodos.map((p) => p.numero), 0) || undefined;
  const problema = validarPolitica(politica, ultimoPeriodo);
  if (problema) throw new ApiError(400, problema);

  const recuperacion = (await obtenerPoliticaRecuperaciones(anio)).anual;
  const entrada = entradaDeCasoSimulado(caso, politica, { aplica: recuperacion.aplica, max_asignaturas_pendientes: recuperacion.max_asignaturas_pendientes }, escalaEfectiva(anio.escala_evaluacion).nota_aprobatoria);
  const r = evaluarPromocion(entrada, politica, caso.momento);
  return { resultado: r.resultado, momento: r.momento, motivos: r.motivos, reglas_disparadas: r.reglas_disparadas, no_renueva_cupo: r.no_renueva_cupo, a_recuperar: r.a_recuperar.map((u) => u.nombre), perdidas: r.perdidas.length };
}
