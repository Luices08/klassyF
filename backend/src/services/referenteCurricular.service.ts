import { grupoGradosDeNumero, TipoReferente } from '../constants/enums';
import Grade from '../models/grade.model';
import { Dba, Ebc, IEbc, ILineamiento, Lineamiento, ReferenteCurricular } from '../models/referenteCurricular.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';

export type ReferenteItemInput = Record<string, unknown> & { tipo_referente: TipoReferente };

/** Crea un solo referente o una carga masiva; cada item se enruta a su discriminador (DBA/EBC/LINEAMIENTO). */
export async function createReferentes(rawItems: ReferenteItemInput | ReferenteItemInput[]) {
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  const creados: unknown[] = [];
  for (const item of items) {
    switch (item.tipo_referente) {
      case 'DBA':
        creados.push(await Dba.create(item));
        break;
      case 'EBC':
        creados.push(await Ebc.create(item));
        break;
      case 'LINEAMIENTO':
        creados.push(await Lineamiento.create(item));
        break;
      default:
        throw new ApiError(400, `tipo_referente '${item.tipo_referente}' no admite carga directa (aun sin fuente).`);
    }
  }
  return creados;
}

export interface ListReferentesQuery {
  grade_id?: string;
  area_id?: string;
  tipo_referente?: string;
  grupo_grados?: string;
  organizador?: string;
  q?: string;
  estado?: string;
}

export async function listReferentes(query: ListReferentesQuery) {
  const filter: Record<string, unknown> = {};
  if (query.grade_id) filter.grade_id = query.grade_id;
  if (query.area_id) filter.area_id = query.area_id;
  if (query.tipo_referente) filter.tipo_referente = query.tipo_referente;
  if (query.grupo_grados) filter.grupo_grados = query.grupo_grados;
  filter.estado = query.estado || ESTADO_ACTIVO;

  const condiciones: Record<string, unknown>[] = [];
  if (query.organizador) {
    condiciones.push({ organizador: query.organizador });
  }
  if (query.q) {
    const regex = new RegExp(query.q.trim(), 'i');
    condiciones.push({
      $or: [
        { enunciado: regex },
        { titulo: regex },
        { contenido: regex },
        { competencia: regex },
        { organizador: regex },
        { etiquetas: regex },
      ],
    });
  }
  if (condiciones.length > 0) filter.$and = condiciones;

  return ReferenteCurricular.find(filter)
    .populate('grade_id', 'nombre numero nivel')
    .populate('area_id', 'nombre codigo')
    .sort({ numero_dba: 1, grupo_grados: 1, orden: 1, createdAt: 1 });
}

/** Organizadores (Pensamiento/Factor/Entorno/Eje) distintos de un area, para el filtro de la malla de seleccion. */
export async function listOrganizadoresPorArea(areaId: string, tipoReferente: 'DBA' | 'EBC' = 'DBA') {
  return ReferenteCurricular.distinct('organizador', {
    area_id: areaId,
    tipo_referente: tipoReferente,
    organizador: { $ne: '' },
    estado: ESTADO_ACTIVO,
  });
}

export interface PanelApoyo {
  ebc: IEbc[];
  lineamientos: ILineamiento[];
}

/**
 * Panel de apoyo del docente al planear un periodo: EBC del grupo de grados
 * que le corresponde a ese grado (meta de largo plazo) y Lineamientos del
 * area (mas los transversales, area_id null) — nunca los escribe, solo los
 * consulta mientras construye el desarrollo curricular a partir de sus DBA.
 */
export async function getPanelApoyo(areaId: string, gradeId: string): Promise<PanelApoyo> {
  const grado = await Grade.findById(gradeId);
  if (!grado) throw new ApiError(404, 'Grado no encontrado.');

  const grupoGrados = grupoGradosDeNumero(grado.numero);

  const [ebc, lineamientos] = await Promise.all([
    grupoGrados
      ? Ebc.find({ area_id: areaId, grupo_grados: grupoGrados, estado: ESTADO_ACTIVO }).sort({ organizador: 1 })
      : Promise.resolve([]),
    Lineamiento.find({
      estado: ESTADO_ACTIVO,
      $or: [{ area_id: areaId }, { area_id: null }],
    }).sort({ orden: 1 }),
  ]);

  return { ebc, lineamientos };
}
