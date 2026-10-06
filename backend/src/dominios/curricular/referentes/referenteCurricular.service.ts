import { Types } from 'mongoose';
import { grupoGradosDeNumero, TipoReferente } from '../../../constants/enums';
import Area from '../plan-estudios/area.model';
import Grade from '../../institucional/estructura/grade.model';
import { Dba, Ebc, IEbc, ILineamiento, Lineamiento, ReferenteCurricular } from './referenteCurricular.model';
import ApiError from '../../../utils/ApiError';
import { ESTADO_ACTIVO, filtroPorEstado } from '../../../utils/filtroEstado';
import { runTransaction } from '../../../utils/runTransaction';
import { registrarEvento } from '../../../services/audit.service';

export type ReferenteItemInput = Record<string, unknown> & { tipo_referente: TipoReferente };

interface ContextoActor {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

function escapeRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Valida las llaves foraneas de un item antes de crearlo: area_id, grade_id (DBA) y dba_relacionados (EBC). */
async function validarForaneos(item: ReferenteItemInput): Promise<void> {
  if (item.area_id) {
    const area = await Area.findById(item.area_id as string);
    if (!area) throw new ApiError(400, `area_id '${item.area_id}' no corresponde a un área existente.`);
  }

  if (item.tipo_referente === 'DBA') {
    const grade = await Grade.findById(item.grade_id as string);
    if (!grade) throw new ApiError(400, `grade_id '${item.grade_id}' no corresponde a un grado existente.`);
  }

  if (item.tipo_referente === 'EBC') {
    const dbaRelacionados = (item.dba_relacionados as string[] | undefined) ?? [];
    if (dbaRelacionados.length > 0) {
      const existentes = await Dba.countDocuments({ _id: { $in: dbaRelacionados } });
      if (existentes !== new Set(dbaRelacionados).size) {
        throw new ApiError(400, 'Uno o más dba_relacionados no existen o no son un DBA.');
      }
    }
  }
}

/** Crea un solo referente o una carga masiva; cada item se enruta a su discriminador (DBA/EBC/LINEAMIENTO). */
export async function createReferentes(
  rawItems: ReferenteItemInput | ReferenteItemInput[],
  { usuarioId, ip }: ContextoActor
) {
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  for (const item of items) {
    await validarForaneos(item);
  }

  // Transaccion: una carga masiva no debe dejar los primeros N items creados si el N+1 falla.
  const creados = await runTransaction(async (session) => {
    const resultado: unknown[] = [];
    for (const item of items) {
      switch (item.tipo_referente) {
        case 'DBA':
          resultado.push((await Dba.create([item], { session }))[0]);
          break;
        case 'EBC':
          resultado.push((await Ebc.create([item], { session }))[0]);
          break;
        case 'LINEAMIENTO':
          resultado.push((await Lineamiento.create([item], { session }))[0]);
          break;
        default:
          throw new ApiError(400, `tipo_referente '${item.tipo_referente}' no admite carga directa (aun sin fuente).`);
      }
    }
    return resultado;
  });

  const porTipo = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.tipo_referente] = (acc[item.tipo_referente] ?? 0) + 1;
    return acc;
  }, {});
  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'REFERENTE_CURRICULAR_CREADO',
    entidad: 'ReferenteCurricular',
    entidad_id: null,
    detalle: Object.entries(porTipo)
      .map(([tipo, cantidad]) => `${cantidad} ${tipo}`)
      .join(', '),
    ip,
  });
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
  filter.estado = filtroPorEstado(query.estado || 'activo');

  const condiciones: Record<string, unknown>[] = [];
  if (query.organizador) {
    condiciones.push({ organizador: query.organizador });
  }
  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q.trim()), 'i');
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
