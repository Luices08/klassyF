import { Types } from 'mongoose';
import AcademicYear from '../models/academicYear.model';
import AdmissionRequest from '../models/admissionRequest.model';
import Campus from '../models/campus.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import JornadaOperativa from '../models/jornadaOperativa.model';
import ApiError from '../utils/ApiError';

export interface FilaDisponibilidadCupos {
  grado: { id: string; nombre: string; numero: number };
  sede: { id: string; nombre: string };
  jornada: { id: string; nombre: string };
  capacidad_total: number;
  matriculados_reales: number;
  solicitudes_espera: number;
  cupos_libres: number;
}

export interface DisponibilidadCuposResponse {
  anio: { id: string; year: number; estado: string };
  filas: FilaDisponibilidadCupos[];
  totales: {
    capacidad_total: number;
    matriculados_reales: number;
    solicitudes_espera: number;
    cupos_libres: number;
  };
}

/**
 * Disponibilidad oficial de cupos para admisiones y matrículas (M04):
 * Centraliza el cálculo real:
 * Capacidad Total = suma de max_capacity de grupos activos
 * Matriculados Reales = suma de cupos ocupados (estudiantes con matrícula firme)
 * Solicitudes en Espera = solicitudes de admisión en estado PENDIENTE para ese año y grado
 * Cupos Libres = Capacidad Total - Matriculados Reales
 */
export async function obtenerDisponibilidadCupos(academicYearId: string): Promise<DisponibilidadCuposResponse> {
  const anio = await AcademicYear.findById(academicYearId).select('year estado');
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');

  const grupos = await Group.find({ academic_year_id: anio._id, estado: 'ACTIVE' }).lean();

  // Agrupar por grado + sede + jornada
  type Cubeta = {
    grade_id: string;
    sede_id: string;
    jornada_id: string;
    capacidad_total: number;
    matriculados_reales: number;
  };
  const cubetasMap = new Map<string, Cubeta>();

  for (const g of grupos) {
    const gradeId = String(g.grade_id);
    const sedeId = String(g.sede_id);
    const jornadaId = g.jornada_id ? String(g.jornada_id) : 'SIN_JORNADA';
    const clave = `${gradeId}|${sedeId}|${jornadaId}`;

    const actual = cubetasMap.get(clave) ?? {
      grade_id: gradeId,
      sede_id: sedeId,
      jornada_id: jornadaId,
      capacidad_total: 0,
      matriculados_reales: 0,
    };

    actual.capacidad_total += g.max_capacity || 0;
    actual.matriculados_reales += g.cupos_ocupados || 0;
    cubetasMap.set(clave, actual);
  }

  // Obtener catálogos para nombres
  const gradeIds = [...new Set([...cubetasMap.values()].map((c) => c.grade_id))];
  const sedeIds = [...new Set([...cubetasMap.values()].map((c) => c.sede_id))];
  const jornadaIds = [...new Set([...cubetasMap.values()].map((c) => c.jornada_id).filter((j) => j !== 'SIN_JORNADA'))];

  const [grados, sedes, jornadas] = await Promise.all([
    Grade.find({ _id: { $in: gradeIds } }).select('nombre numero').lean(),
    Campus.find({ _id: { $in: sedeIds } }).select('nombre').lean(),
    JornadaOperativa.find({ _id: { $in: jornadaIds } }).select('nombre').lean(),
  ]);

  const gradoPorId = new Map(grados.map((g) => [String(g._id), g]));
  const sedePorId = new Map(sedes.map((s) => [String(s._id), s]));
  const jornadaPorId = new Map(jornadas.map((j) => [String(j._id), j]));

  // Conteo de solicitudes en espera (PENDIENTE) agrupadas por grado deseado
  const pendientes = await AdmissionRequest.aggregate<{ _id: Types.ObjectId; total: number }>([
    {
      $match: {
        academic_year_id: anio._id,
        estado: 'PENDIENTE',
      },
    },
    {
      $group: {
        _id: '$grado_deseado_id',
        total: { $sum: 1 },
      },
    },
  ]);
  const pendientesPorGrado = new Map(pendientes.map((p) => [String(p._id), p.total]));

  const filas: FilaDisponibilidadCupos[] = [];
  let totalCapacidad = 0;
  let totalMatriculados = 0;
  let totalEspera = 0;
  let totalLibres = 0;

  for (const c of cubetasMap.values()) {
    const gr = gradoPorId.get(c.grade_id);
    const se = sedePorId.get(c.sede_id);
    const jo = jornadaPorId.get(c.jornada_id);

    const capacidad = c.capacidad_total;
    const matriculados = c.matriculados_reales;
    // Solicitudes en espera para este grado (distribuido proporcional o total por grado)
    const enEspera = pendientesPorGrado.get(c.grade_id) || 0;
    const libres = Math.max(0, capacidad - matriculados);

    totalCapacidad += capacidad;
    totalMatriculados += matriculados;
    totalLibres += libres;

    filas.push({
      grado: { id: c.grade_id, nombre: gr?.nombre ?? '—', numero: gr?.numero ?? 0 },
      sede: { id: c.sede_id, nombre: se?.nombre ?? '—' },
      jornada: { id: c.jornada_id, nombre: jo?.nombre ?? 'Única' },
      capacidad_total: capacidad,
      matriculados_reales: matriculados,
      solicitudes_espera: enEspera,
      cupos_libres: libres,
    });
  }

  // Sumar solicitudes pendientes totales del año
  totalEspera = [...pendientesPorGrado.values()].reduce((acc, v) => acc + v, 0);

  filas.sort((a, b) => a.grado.numero - b.grado.numero || a.sede.nombre.localeCompare(b.sede.nombre, 'es'));

  return {
    anio: { id: String(anio._id), year: anio.year, estado: anio.estado },
    filas,
    totales: {
      capacidad_total: totalCapacidad,
      matriculados_reales: totalMatriculados,
      solicitudes_espera: totalEspera,
      cupos_libres: totalLibres,
    },
  };
}
