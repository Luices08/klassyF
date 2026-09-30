import DBABank from '../models/dbaBank.model';
import catchAsync from '../utils/catchAsync';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';

interface DbaItemBody {
  tipo_referente?: 'DBA' | 'EBC' | 'MATRIZ_ICFES' | 'LINEAMIENTO';
  grade_id?: string | null;
  area_id: string;
  numero_dba?: number | null;
  enunciado: string;
  evidencias_aprendizaje?: string[];
  eje_tematico?: string;
  organizador?: string;
  ejemplo?: string;
  grupo_grados?: string;
  competencia?: string;
  componente?: string;
  etiquetas?: string[];
  version?: string;
  fuente?: string;
  estado?: 'activo' | 'inactivo';
}

// Carga/seed: el body puede ser un solo objeto DBA o un array para carga masiva.
export const createDbaEntries = catchAsync<unknown, unknown, DbaItemBody | DbaItemBody[]>(async (req, res) => {
  const rawItems = Array.isArray(req.body) ? req.body : [req.body];
  const items = rawItems.map((item) => ({
    ...item,
    organizador: item.organizador || item.eje_tematico || '',
    eje_tematico: item.eje_tematico || item.organizador || '',
  }));
  const created = await DBABank.insertMany(items, { ordered: true });
  res.status(201).json({ success: true, count: created.length, data: created });
});

interface ListDbaQuery {
  grade_id?: string;
  area_id?: string;
  tipo_referente?: string;
  organizador?: string;
  q?: string;
  estado?: string;
}

export const listDbaEntries = catchAsync<unknown, unknown, unknown, ListDbaQuery>(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.grade_id) filter.grade_id = req.query.grade_id;
  if (req.query.area_id) filter.area_id = req.query.area_id;
  if (req.query.tipo_referente) filter.tipo_referente = req.query.tipo_referente;

  if (req.query.estado) {
    filter.estado = req.query.estado;
  } else {
    filter.estado = ESTADO_ACTIVO;
  }

  const conditions: Record<string, unknown>[] = [];

  if (req.query.organizador) {
    conditions.push({
      $or: [
        { organizador: req.query.organizador },
        { eje_tematico: req.query.organizador },
      ],
    });
  }

  if (req.query.q) {
    const regex = new RegExp(req.query.q.trim(), 'i');
    conditions.push({
      $or: [
        { enunciado: regex },
        { etiquetas: regex },
        { competencia: regex },
        { componente: regex },
        { organizador: regex },
      ],
    });
  }

  if (conditions.length > 0) {
    filter.$and = conditions;
  }

  const entries = await DBABank.find(filter)
    .populate('grade_id', 'nombre numero nivel')
    .populate('area_id', 'nombre codigo')
    .sort({ numero_dba: 1, createdAt: 1 });

  res.status(200).json({ success: true, count: entries.length, data: entries });
});

// Endpoint auxiliar: obtener lista de organizadores (pensamientos / ejes) por área
export const listOrganizadoresPorArea = catchAsync<{ areaId: string }>(async (req, res) => {
  const { areaId } = req.params;
  const organizadores = await DBABank.distinct('organizador', {
    area_id: areaId,
    organizador: { $ne: '' },
    estado: ESTADO_ACTIVO,
  });
  res.status(200).json({ success: true, data: organizadores });
});
